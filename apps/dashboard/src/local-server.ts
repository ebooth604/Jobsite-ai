/**
 * Local preview, in two modes.
 *
 *   dev (default, :4173) — everything, including the admin onboarding surface.
 *   rc  (:4174)          — exactly what the deployed Lambda serves. No admin.
 *
 * The point of rc mode is that "works on my machine" and "works on the site" stop
 * being different questions. If a page works in dev but not rc, the difference is
 * the admin mount — and that is now something you can see rather than remember.
 *
 * Bound to loopback in both modes. The demo renders synthetic data, but a dev
 * server that quietly listens on every interface is a habit worth not forming in a
 * codebase that will later handle jobsite media — doubly so now that an
 * unauthenticated admin form is one of the things it serves.
 */

import { createServer } from "node:http";
import { ADMIN_PATHS, renderAdmin } from "./admin.js";
import {
  captureClientScriptFor,
  handleAssist,
  handleVision,
  renderPath,
  renderStatic,
  renderWithQuery,
} from "./app.js";
import { resolveTenant } from "./tenant.js";

type Mode = "dev" | "rc";

const MODE: Mode = process.env.SITEWIREAI_MODE === "rc" ? "rc" : "dev";
process.env.SITEWIREAI_MODE = MODE;

// The `?org=` switcher is a development affordance and is enabled here, in the
// dev server only. `rc` mirrors production, where the flag is absent and every
// request resolves to the default tenant. See tenant.ts.
if (MODE === "dev") process.env.SITEWIREAI_DEV_ORG_SWITCH = "1";

const PORT = Number(process.env.PORT ?? (MODE === "rc" ? 4174 : 4173));
const HOST = "127.0.0.1";

/** Only dev mounts admin. rc mirrors production, where it is absent. */
const adminMounted = MODE === "dev";

const server = createServer((req, res) => {
  const path = (req.url ?? "/").split("?")[0] ?? "/";

  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", mode: MODE, adminMounted }));
    return;
  }

  // Static assets ship now, so both modes serve them — rc has to mirror what the
  // deployed site does, and gating this on dev is exactly the drift rc exists to
  // catch.
  if (path.startsWith("/static/")) {
    const asset = renderStatic(path);
    if (asset) {
      res.writeHead(200, {
        "content-type": asset.contentType,
        "cache-control": "public, max-age=3600",
      });
      res.end(asset.body);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found.");
    return;
  }

  if (ADMIN_PATHS.has(path)) {
    if (!adminMounted) {
      // The same answer the deployed site gives: this route does not exist here.
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found.");
      return;
    }
    const admin = renderAdmin(path, (p) =>
      captureClientScriptFor(p === "/contact.js" ? "contact-client.js" : "admin-client.js"),
    );
    if (admin) {
      res.writeHead(admin.status, {
        "content-type": admin.contentType,
        "cache-control": "no-store",
        ...(admin.headers ?? {}),
      });
      res.end(admin.body);
      return;
    }
  }

  const rawQuery = (req.url ?? "").split("?")[1] ?? "";

  if ((path === "/ai" || path === "/ai/vision") && req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        const tenant = await resolveTenant(rawQuery);
        const run = path === "/ai/vision" ? handleVision : handleAssist;
        const ai = await run(Buffer.concat(chunks).toString("utf8"), tenant?.orgId ?? null);
        res.writeHead(ai.status, { "content-type": ai.contentType, "cache-control": "no-store" });
        res.end(ai.body);
      })();
    });
    return;
  }

  void (async () => {
    // One identity resolution per request, threaded down.
    const tenant = await resolveTenant(rawQuery);
    const orgId = tenant?.orgId ?? null;

    const withQuery = await renderWithQuery(req.url ?? "/", orgId);
    const { status, contentType, body } = withQuery ?? (await renderPath(path, orgId));
    res.writeHead(status, {
      "content-type": contentType,
      "cache-control": "no-store",
    });
    res.end(body);
  })();
});

server.listen(PORT, HOST, () => {
  const admin = adminMounted
    ? `  · admin: http://${HOST}:${PORT}/admin`
    : "  · admin not mounted (production parity)";
  process.stdout.write(`SiteWireAi [${MODE}] http://${HOST}:${PORT}${admin}\n`);
});
