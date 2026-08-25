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

import { adminView } from "./admin-view.js";
import { contactView, helpView } from "./contact-view.js";

export interface AdminResponse {
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
}

const HTML = "text/html; charset=utf-8";

/**
 * Everything mounted only by the dev server. Contact and Help live here for now
 * too: they are customer-facing pages, but they reference an inbox and a mail
 * flow that do not exist yet, so shipping them would promise a reply nobody is
 * listening for.
 */
export const ADMIN_PATHS = new Set(["/admin", "/admin.js", "/contact", "/contact.js", "/help"]);

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
  if (path === "/contact") {
    return { status: 200, contentType: HTML, body: contactView() };
  }
  if (path === "/help") {
    return { status: 200, contentType: HTML, body: helpView() };
  }
  if (path === "/admin.js" || path === "/contact.js") {
    return { status: 200, contentType: "text/javascript; charset=utf-8", body: script(path) };
  }
  return null;
}
