/**
 * The trainer's local server.
 *
 * Loopback only, and not configurable to be otherwise. The dashboard binds to
 * 127.0.0.1 out of habit, on synthetic data; this app holds photographs of real
 * jobsites, real workers and one customer's quantities, so the same choice here is
 * load-bearing rather than tidy. If this ever needs to be reachable by a second
 * labeller it wants accounts and TLS, not a wider bind address.
 *
 * There is no build step for the browser code beyond `tsc` — the compiled client
 * modules are served straight from `dist/client`, the same arrangement the
 * dashboard uses, with an allowlist so a path never reaches the filesystem raw.
 */

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyQueue,
  classifySample,
  createSample,
  draftChain,
  exportFromForm,
  jsonType,
  performExport,
  removeSample,
  updateSample,
} from "./api.js";
import { assistView } from "./assist-view.js";
import type { ExportResult } from "./export.js";
import { intakeView, sampleView } from "./label-view.js";
import { prelabelHealth, requestProposals, requestSegmentation } from "./prelabel.js";
import {
  findOrphans,
  getSample,
  listSamples,
  openStore,
  readImage,
  storeLocation,
  unreadableSamples,
} from "./store.js";
import {
  coverageView,
  EMPTY_FILTERS,
  exportView,
  integrityView,
  libraryView,
  neighboursOf,
  reviewView,
} from "./views.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4180);
const HTML = "text/html; charset=utf-8";
const HERE = dirname(fileURLToPath(import.meta.url));

/** Only these names are servable. The request path never becomes a file path. */
const CLIENT_SCRIPTS: Record<string, string> = {
  "/intake.js": "intake-client.js",
  "/sample.js": "sample-client.js",
  "/assist.js": "assist-client.js",
};

const scriptCache = new Map<string, string>();

function clientScript(file: string): string {
  const cached = scriptCache.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(join(HERE, "client", file), "utf8");
  scriptCache.set(file, text);
  return text;
}

/**
 * 24 MB. Twice the per-image ceiling `api.ts` enforces, because base64 inflates by
 * a third and a request that is merely too large should be refused by the handler
 * with a sentence a person can read, not dropped by the socket.
 */
const MAX_BODY_BYTES = 24 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer((req, res) => {
  void handle(req, res).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "content-type": jsonType });
    res.end(JSON.stringify({ error: message }));
  });
});

async function handle(req: IncomingMessage, res: import("node:http").ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const method = req.method ?? "GET";

  const html = (status: number, body: string) => {
    res.writeHead(status, { "content-type": HTML, "cache-control": "no-store" });
    res.end(body);
  };
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": jsonType, "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  };

  if (path === "/healthz") {
    json(200, { status: "ok", store: storeLocation(), samples: listSamples().length });
    return;
  }

  const scriptFile = CLIENT_SCRIPTS[path];
  if (scriptFile) {
    res.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(clientScript(scriptFile));
    return;
  }

  if (path.startsWith("/images/")) {
    const image = await readImage(path.slice("/images/".length));
    if (!image) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found.");
      return;
    }
    // Immutable: redaction is baked in before upload and nothing in this app ever
    // rewrites those bytes, so there is no version of this image a cache could be
    // holding that is less redacted than the current one. With an S3 corpus this is
    // the difference between a library page costing one round trip and twenty-four.
    res.writeHead(200, {
      "content-type": image.contentType,
      "cache-control": "private, max-age=31536000, immutable",
    });
    res.end(image.body);
    return;
  }

  // ---- write path -------------------------------------------------------

  if (path === "/api/samples" && method === "POST") {
    const body = await readBody(req);
    if (body === null) {
      json(413, { error: "That upload was too large. The per-image limit is 12 MB." });
      return;
    }
    const result = await createSample(body);
    json(result.status, result.body);
    return;
  }

  if (path.startsWith("/api/samples/")) {
    const id = decodeURIComponent(path.slice("/api/samples/".length));
    if (method === "DELETE") {
      const result = await removeSample(id);
      json(result.status, result.body);
      return;
    }
    if (method === "PATCH" || method === "POST") {
      const body = await readBody(req);
      if (body === null) {
        json(413, { error: "Body too large." });
        return;
      }
      const result = await updateSample(id, body);
      json(result.status, result.body);
      return;
    }
    json(405, { error: `Cannot ${method} a sample.` });
    return;
  }

  // ---- detection assist -------------------------------------------------
  //
  // Proxied through this server rather than called from the browser directly, so
  // the page needs no knowledge of where the sidecar is and no CORS hole has to
  // exist on it. The sidecar stays reachable from one process on one machine.

  if (path === "/api/prelabel/health" && method === "GET") {
    json(200, await prelabelHealth());
    return;
  }

  if (path === "/api/prelabel" && method === "POST") {
    const body = await readBody(req);
    if (body === null) {
      json(413, { error: "That image is too large." });
      return;
    }
    let parsed: { image?: unknown; want?: unknown } = {};
    try {
      parsed = JSON.parse(body || "{}") as { image?: unknown; want?: unknown };
    } catch {
      json(400, { error: "Body was not JSON." });
      return;
    }
    const image = typeof parsed.image === "string" ? parsed.image : "";
    if (!image) {
      json(400, { error: "No image supplied." });
      return;
    }
    const want = parsed.want === "people" ? "people" : "all";
    const result = await requestProposals(image, want);
    json(result.ok ? 200 : 503, result);
    return;
  }

  // Stage four: the reasoning model drafts a chain for one sample.
  if (path.startsWith("/api/reason/") && method === "POST") {
    const id = decodeURIComponent(path.slice("/api/reason/".length));
    const result = await draftChain(id);
    json(result.status, result.body);
    return;
  }

  // Stage four, aimed at intake instead of a chain: trade, scope, conditions,
  // hard cases. Returned unsaved — the sample editor's own Save is the write.
  if (path.startsWith("/api/classify/") && method === "POST") {
    const id = decodeURIComponent(path.slice("/api/classify/".length));
    const result = await classifySample(id);
    json(result.status, result.body);
    return;
  }

  if (path === "/api/prelabel/segment" && method === "POST") {
    const body = await readBody(req);
    if (body === null) {
      json(413, { error: "That image is too large." });
      return;
    }
    let parsed: { image?: unknown; box?: unknown } = {};
    try {
      parsed = JSON.parse(body || "{}") as { image?: unknown; box?: unknown };
    } catch {
      json(400, { error: "Body was not JSON." });
      return;
    }
    const image = typeof parsed.image === "string" ? parsed.image : "";
    const box = parsed.box as { x?: unknown; y?: unknown; w?: unknown; h?: unknown } | undefined;
    const coords = [box?.x, box?.y, box?.w, box?.h];
    if (!image || !coords.every((c) => typeof c === "number" && Number.isFinite(c))) {
      json(400, { error: "Segmentation needs an image and a box to work from." });
      return;
    }
    const [x = 0, y = 0, w = 0, h = 0] = coords as number[];
    const result = await requestSegmentation(image, { x, y, w, h });
    json(result.ok ? 200 : 503, result);
    return;
  }

  if (path === "/export" && method === "POST") {
    const body = (await readBody(req)) ?? "";
    const result: ExportResult = await performExport(exportFromForm(new URLSearchParams(body)));
    html(result.ok ? 200 : 409, exportView(listSamples(), storeLocation(), result));
    return;
  }

  if (path === "/review" && method === "POST") {
    const result = await classifyQueue();
    html(200, reviewView(listSamples(), storeLocation(), result));
    return;
  }

  // ---- read path --------------------------------------------------------

  const samples = listSamples();

  if (path.startsWith("/sample/")) {
    const id = decodeURIComponent(path.slice("/sample/".length));
    const sample = getSample(id);
    if (!sample) {
      html(404, libraryView(samples, EMPTY_FILTERS, storeLocation()));
      return;
    }
    html(200, sampleView(sample, storeLocation(), samples.length, neighboursOf(samples, id)));
    return;
  }

  switch (path) {
    case "/":
      html(
        200,
        libraryView(
          samples,
          {
            trade: url.searchParams.get("trade") ?? "",
            source: url.searchParams.get("source") ?? "",
            split: url.searchParams.get("split") ?? "",
            status: url.searchParams.get("status") ?? "",
            query: url.searchParams.get("q") ?? "",
          },
          storeLocation(),
        ),
      );
      return;
    case "/intake":
      html(200, intakeView(storeLocation(), samples.length));
      return;
    case "/assist":
      html(200, assistView(samples, storeLocation()));
      return;
    case "/review":
      html(200, reviewView(samples, storeLocation(), null));
      return;
    case "/coverage":
      html(200, coverageView(samples, storeLocation()));
      return;
    case "/export":
      html(200, exportView(samples, storeLocation(), null));
      return;
    case "/integrity":
      html(200, integrityView(samples, await findOrphans(), unreadableSamples(), storeLocation()));
      return;
    default:
      html(404, libraryView(samples, EMPTY_FILTERS, storeLocation()));
      return;
  }
}

/**
 * The corpus is opened and indexed before the socket is, so the first request is
 * answered from a complete library rather than an empty one. If it cannot be
 * opened — a malformed `s3://` URI, expired credentials, a non-Canadian region —
 * the process exits with the reason rather than starting a tool that would accept
 * photographs into nowhere.
 */
try {
  await openStore();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`SiteWireAi trainer could not open its corpus.\n  ${message}\n`);
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `SiteWireAi trainer  http://${HOST}:${PORT}\n` +
      `  corpus: ${storeLocation()} (${listSamples().length} samples)\n`,
  );
});
