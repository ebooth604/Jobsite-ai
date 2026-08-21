/**
 * Core API — scaffold.
 *
 * Deliberately built on node:http with no web framework. This service has
 * two real routes today; adding Fastify now would be choosing a framework
 * before there is anything to frame. Swap it in at phase 1 (see
 * docs/architecture.md §8) when there are routes worth the abstraction.
 *
 * Run: npm run dev:api
 */

import { createServer } from 'node:http';
import { routes, type RouteContext } from './routes/index.ts';

const PORT = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const route = routes.find((r) => r.method === req.method && r.path === url.pathname);

  if (!route) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found', path: url.pathname }));
    return;
  }

  const ctx: RouteContext = { url };

  try {
    const result = await route.handler(ctx);
    res.writeHead(result.status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result.body));
  } catch (error) {
    const notImplemented = error instanceof Error && error.name === 'NotImplementedError';
    const status = notImplemented ? 501 : 500;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        error: notImplemented ? 'not_implemented' : 'internal_error',
        message: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }
});

server.listen(PORT, () => {
  console.log(`api listening on :${PORT}`);
});
