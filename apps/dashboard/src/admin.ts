/**
 * Admin surface mounting — the switch that decides where onboarding is reachable.
 *
 * Today it is served only by the local dev server. The scaffolding to put it live
 * is here and complete, so enabling it later is configuration rather than a code
 * change:
 *
 *   ADMIN_ENABLED=1
 *   ADMIN_BASIC_AUTH=<user>:<password>
 *
 * Both are required. `ADMIN_ENABLED` on its own does nothing, deliberately: the
 * failure mode worth designing out is someone flipping a feature flag and quietly
 * publishing an unauthenticated admin panel. Making the unsafe state unreachable
 * is better than documenting that it is unsafe.
 *
 * Basic auth over TLS is the floor, not the destination — it is a single shared
 * credential with no revocation and no audit trail of who used it. Before this
 * carries real customer data it wants proper accounts, which is what Cognito is
 * already named for in technical plan §3.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adminView } from "./admin-view.js";
import { demoCaptureView } from "./demo-capture-view.js";

export interface AdminResponse {
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
}

const HTML = "text/html; charset=utf-8";

/**
 * Mounted only by the dev server. Contact and Help used to live here; they are
 * public now and route through app.ts like any other page.
 */
export const ADMIN_PATHS = new Set(["/admin", "/admin.js", "/capture/demo"]);

/** Where dev-only static demo assets live, relative to the compiled output. */
const STATIC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "static");

/** The demo photo is dropped in by hand, so the page has to cope with it missing. */
export function demoImagePresent(): boolean {
  return existsSync(join(STATIC_ROOT, "demo", "drywall-l4.jpg"));
}

/**
 * Serves a file from the dev-only static root. Path traversal is blocked by
 * resolving and then checking containment, rather than by filtering "..", which
 * misses encodings.
 */
export function readStatic(urlPath: string): { body: Buffer; contentType: string } | null {
  const rel = urlPath.replace(/^\/static\//, "");
  const full = resolve(STATIC_ROOT, rel);
  if (!full.startsWith(resolve(STATIC_ROOT))) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;

  const ext = full.slice(full.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  const contentType = types[ext];
  if (!contentType) return null;

  return { body: readFileSync(full), contentType };
}

/** Live-mounting requires BOTH the flag and a credential. */
export function adminEnabledRemotely(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ADMIN_ENABLED === "1" && Boolean(env.ADMIN_BASIC_AUTH);
}

/**
 * Constant-time-ish comparison. Not a defence against a determined attacker on a
 * shared secret, but it costs nothing and avoids leaking length via early exit.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkBasicAuth(
  header: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const expected = env.ADMIN_BASIC_AUTH;
  if (!expected) return false;
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  return safeEqual(decoded, expected);
}

export const UNAUTHORIZED: AdminResponse = {
  status: 401,
  contentType: "text/plain; charset=utf-8",
  body: "Authentication required.",
  headers: { "www-authenticate": 'Basic realm="SiteWireAi admin", charset="UTF-8"' },
};

/**
 * Renders an admin path. Callers decide whether the surface is mounted at all —
 * this only knows how to draw it.
 */
export function renderAdmin(path: string, script: (path: string) => string): AdminResponse | null {
  if (path === "/admin") {
    return { status: 200, contentType: HTML, body: adminView() };
  }
  if (path === "/capture/demo") {
    return { status: 200, contentType: HTML, body: demoCaptureView(demoImagePresent()) };
  }
  if (path === "/admin.js") {
    return { status: 200, contentType: "text/javascript; charset=utf-8", body: script(path) };
  }
  return null;
}
