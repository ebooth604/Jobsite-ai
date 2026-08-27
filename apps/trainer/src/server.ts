/**
 * The local development server — a thin `node:http` adapter over `router.ts`.
 *
 * Loopback only. That was a privacy decision when this app held a corpus, and it
 * stays one: the photos are unredacted and this door has no authentication in
 * front of it. The deployed Lambda does (see `handler.ts`); this one does not,
 * which is exactly why it does not listen on anything but 127.0.0.1.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { classifierAvailable, modelName } from "./classify.js";
import { route } from "./router.js";
import { openStore, storeLocation } from "./store.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 4180);

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
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  });
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  const body = await readBody(req);
  if (body === null) {
    res.writeHead(413, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "That upload was too large. The limit is 12 MB." }));
    return;
  }

  const result = await route({
    method: req.method ?? "GET",
    path,
    body,
    query: url.search.slice(1),
  });
  res.writeHead(result.status, result.headers);
  res.end(result.isBase64 ? Buffer.from(result.body, "base64") : result.body);
}

await openStore();

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `SiteWireAi  http://${HOST}:${PORT}\n` +
      `  store: ${storeLocation()}\n` +
      `  model: ${modelName()}${classifierAvailable() ? "" : "  (no ANTHROPIC_API_KEY set)"}\n` +
      "  local only · no auth · photos stored unredacted · classification calls the model API\n",
  );
});
