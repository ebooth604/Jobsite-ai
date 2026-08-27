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
  handleCaptureUpload,
  handleVision,
  renderPath,
  renderStatic,
  renderWithQuery,
} from "./app.js";
import { handleAdmin } from "./admin-routes.js";
import { parseCookies, SESSION_COOKIE, verifySession } from "./auth.js";
import { beginLogin, beginLogout, completeLogin } from "./auth-routes.js";
import { handleClassifications } from "./classification-routes.js";
import { isAdminWithoutTenant, resolveTenant, wantsSpecificOrg } from "./tenant.js";

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
  const cookieHeader = req.headers.cookie ?? "";
  const host = req.headers.host ?? `${HOST}:${PORT}`;
  const proto = String(req.headers["x-forwarded-proto"] ?? "http");

  if (path === "/login" || path === "/auth/callback" || path === "/logout") {
    void (async () => {
      const result =
        path === "/login"
          ? beginLogin(host, proto)
          : path === "/logout"
            ? beginLogout(host, proto)
            : await completeLogin(host, proto, rawQuery, cookieHeader);
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    })();
    return;
  }

  const POSTS: Record<string, typeof handleAssist> = {
    "/ai": handleAssist,
    "/ai/vision": handleVision,
    "/api/captures": handleCaptureUpload,
  };

  const post = POSTS[path];
  if (post && req.method === "POST") {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        const tenant = await resolveTenant({ rawQuery, cookieHeader });
        const result = await post(Buffer.concat(chunks).toString("utf8"), tenant?.orgId ?? null);
        res.writeHead(result.status, {
          "content-type": result.contentType,
          "cache-control": "no-store",
        });
        res.end(result.body);
      })();
    });
    return;
  }

  // The admin console. Every path under /admin goes through requireAdmin before
  // any handler runs — it is the one surface that crosses tenants.
  if (path.startsWith("/admin")) {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void (async () => {
        const token = parseCookies(cookieHeader)[SESSION_COOKIE] ?? "";
        const session = await verifySession(token);
        const admin = await handleAdmin(
          path,
          req.method ?? "GET",
          rawQuery,
          Buffer.concat(chunks).toString("utf8"),
          session,
        );
        if (!admin) {
          res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
          res.end("Not found.");
          return;
        }
        res.writeHead(admin.status, admin.headers);
        res.end(admin.body);
      })();
    });
    return;
  }

  void (async () => {
    // One identity resolution per request, threaded down.
    const tenant = await resolveTenant({ rawQuery, cookieHeader });
    const orgId = tenant?.orgId ?? null;

    // An admin has no tenant, so the client view has nothing for them. Send
    // them to the console rather than to a page that reads as broken.
    if (!orgId && (await isAdminWithoutTenant({ rawQuery, cookieHeader }))) {
      res.writeHead(303, { location: "/admin", "cache-control": "no-store" });
      res.end();
      return;
    }

    // The root is the front door for anyone without a session: the two sign-in
    // choices, not a dashboard belonging to whichever tenant sorted first. An
    // explicit `?org=` in dev still means "show me that tenant".
    if (
      path === "/" &&
      !tenant?.authenticated &&
      !wantsSpecificOrg({ rawQuery, cookieHeader })
    ) {
      const welcome = await renderPath("/welcome", null);
      res.writeHead(welcome.status, {
        "content-type": welcome.contentType,
        "cache-control": "no-store",
      });
      res.end(welcome.body);
      return;
    }

    if (path === "/captures" || path.startsWith("/captures/")) {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      await new Promise((done) => req.on("end", done));
      const result = await handleClassifications(
        path,
        req.method ?? "GET",
        rawQuery,
        Buffer.concat(chunks).toString("utf8"),
        orgId,
      );
      if (result) {
        res.writeHead(result.status, result.headers);
        res.end(result.body);
        return;
      }
    }

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
