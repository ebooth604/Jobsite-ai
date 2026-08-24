/**
 * Local preview: `pnpm --filter @sitewire/dashboard run serve`.
 *
 * Bound to loopback only. The demo renders synthetic data, but a dev server that
 * quietly listens on every interface is a habit worth not forming in a codebase
 * that will later handle jobsite media.
 */

import { createServer } from "node:http";
import { handleAssist, handleVision, renderPath, renderWithQuery } from "./app.js";

const PORT = Number(process.env.PORT ?? 4173);
const HOST = "127.0.0.1";

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0] ?? "/";

  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if ((path === "/ai" || path === "/ai/vision") && req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const run = path === "/ai/vision" ? handleVision : handleAssist;
      void run(Buffer.concat(chunks).toString("utf8")).then((ai) => {
        res.writeHead(ai.status, { "content-type": ai.contentType, "cache-control": "no-store" });
        res.end(ai.body);
      });
    });
    return;
  }

  const withQuery = renderWithQuery(req.url ?? "/");
  const { status, contentType, body } = withQuery ?? renderPath(path);
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(body);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Sitewire demo dashboard: http://${HOST}:${PORT}\n`);
});
