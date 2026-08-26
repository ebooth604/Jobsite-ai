/**
 * The local server.
 *
 * Loopback only. That was a privacy decision when this app redacted faces and
 * held a corpus; it stays one now for a blunter reason — the photos here are
 * unredacted and there is no authentication in front of them.
 *
 * Routes, in full:
 *
 *   GET  /                        library
 *   GET  /upload                  uploader
 *   GET  /photo/:id               one photo and its classification
 *   POST /photo/:id/classify      re-run the model, then redirect back
 *   POST /photo/:id/delete        delete, then redirect to the library
 *   POST /classify-all            classify everything unclassified
 *   POST /api/photos              upload (JSON)
 *   POST /api/photos/:id/classify classify one (JSON)
 *   GET  /images/:file            the stored bytes
 *   GET  /healthz
 */

import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ClassifyAllResult,
  classifyAll,
  classifyPhoto,
  createPhoto,
  jsonType,
  removePhoto,
} from "./api.js";
import { classifierAvailable, modelName } from "./classify.js";
import { getPhoto, listPhotos, mediaTypeFor, openStore, readImage, storeLocation } from "./store.js";
import { libraryView, photoView, uploadView } from "./views.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4180);
const HTML = "text/html; charset=utf-8";
const HERE = dirname(fileURLToPath(import.meta.url));

/** Only this name is servable. A request path never becomes a file path. */
const CLIENT_SCRIPTS: Record<string, string> = { "/upload.js": "upload-client.js" };

const scriptCache = new Map<string, string>();

function clientScript(file: string): string {
  const cached = scriptCache.get(file);
  if (cached !== undefined) return cached;
  const text = readFileSync(join(HERE, "client", file), "utf8");
  scriptCache.set(file, text);
  return text;
}

/** 24 MB — twice the per-image ceiling, because base64 inflates by a third. */
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

/** The last batch result, held just long enough to render it after the redirect. */
let lastBatch: ClassifyAllResult | null = null;

async function handle(req: IncomingMessage, res: ServerResponse) {
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
  const redirect = (to: string) => {
    res.writeHead(303, { location: to, "cache-control": "no-store" });
    res.end();
  };

  if (path === "/healthz") {
    json(200, {
      status: "ok",
      store: storeLocation(),
      photos: (await listPhotos()).length,
      model: modelName(),
      classifier: classifierAvailable() ? "ready" : "no ANTHROPIC_API_KEY",
    });
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
    const file = path.slice("/images/".length);
    const bytes = await readImage(file);
    if (!bytes) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found.");
      return;
    }
    res.writeHead(200, {
      "content-type": mediaTypeFor(file),
      "cache-control": "private, max-age=31536000, immutable",
    });
    res.end(bytes);
    return;
  }

  // ---- JSON API (the uploader) -------------------------------------------

  if (path === "/api/photos" && method === "POST") {
    const body = await readBody(req);
    if (body === null) {
      json(413, { error: "That upload was too large. The per-image limit is 12 MB." });
      return;
    }
    const result = await createPhoto(body);
    json(result.status, result.body);
    return;
  }

  if (path.startsWith("/api/photos/") && path.endsWith("/classify") && method === "POST") {
    const id = decodeURIComponent(path.slice("/api/photos/".length, -"/classify".length));
    const result = await classifyPhoto(id);
    json(result.status, result.body);
    return;
  }

  // ---- form posts ---------------------------------------------------------

  if (path === "/classify-all" && method === "POST") {
    lastBatch = await classifyAll();
    redirect("/");
    return;
  }

  if (path.startsWith("/photo/") && method === "POST") {
    if (path.endsWith("/classify")) {
      const id = decodeURIComponent(path.slice("/photo/".length, -"/classify".length));
      await classifyPhoto(id);
      redirect(`/photo/${encodeURIComponent(id)}`);
      return;
    }
    if (path.endsWith("/delete")) {
      const id = decodeURIComponent(path.slice("/photo/".length, -"/delete".length));
      await removePhoto(id);
      redirect("/");
      return;
    }
  }

  // ---- pages --------------------------------------------------------------

  const photos = await listPhotos();

  if (path.startsWith("/photo/")) {
    const id = decodeURIComponent(path.slice("/photo/".length));
    const photo = await getPhoto(id);
    if (!photo) {
      html(404, libraryView(photos, storeLocation(), null));
      return;
    }
    html(200, photoView(photo, storeLocation(), photos.length));
    return;
  }

  switch (path) {
    case "/": {
      // Shown once, then cleared, so a refresh does not repeat a stale summary.
      const batch = lastBatch;
      lastBatch = null;
      html(200, libraryView(photos, storeLocation(), batch));
      return;
    }
    case "/upload":
      html(200, uploadView(storeLocation(), photos.length));
      return;
    default:
      html(404, libraryView(photos, storeLocation(), null));
      return;
  }
}

await openStore();

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `SiteWireAi  http://${HOST}:${PORT}\n` +
      `  store: ${storeLocation()}\n` +
      `  model: ${modelName()} ${classifierAvailable() ? "" : "(no ANTHROPIC_API_KEY set)"}\n` +
      "  local only · photos are stored unredacted · classification sends them to the model API\n",
  );
});
