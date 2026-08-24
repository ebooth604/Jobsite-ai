/**
 * Local preview: `pnpm --filter @sitewire/dashboard run serve`.
 *
 * Bound to loopback only. The demo renders synthetic data, but a dev server that
 * quietly listens on every interface is a habit worth not forming in a codebase
 * that will later handle jobsite media.
 */

import { createServer } from "node:http";
import { renderPath } from "./app.js";

const PORT = Number(process.env.PORT ?? 4173);
const HOST = "127.0.0.1";

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0] ?? "/";

  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  const { status, html } = renderPath(path);
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Sitewire demo dashboard: http://${HOST}:${PORT}\n`);
});
