/**
 * Who is asking.
 *
 * This module is the only place that answers that question, so that changing
 * the mechanism is a change here and nowhere else. Everything downstream takes
 * an `orgId` it was handed and never re-derives one.
 *
 * **The answer now comes from a verified Cognito ID token**, read from an
 * httpOnly session cookie and checked against the pool's JWKS on every request —
 * signature, issuer, audience, expiry. The tenant is the `custom:orgId` claim
 * inside it, which means a caller cannot influence it: editing the cookie
 * invalidates the signature, and there is no URL parameter that reaches this.
 *
 * The `?org=` switcher that milestone 1 used is still here, and is still gated
 * on `SITEWIREAI_DEV_ORG_SWITCH=1`. It now applies **only when no valid session
 * exists** — a signed-in user's tenant always wins over a query string, so the
 * switcher cannot be used to look sideways out of a real session. It is set by
 * the local dev server in dev mode and never in production.
 */

import { getOrgBySlug, listOrgs, type OrgRow } from "@sitewireai/db";
import { parseCookies, SESSION_COOKIE, verifySession } from "./auth.js";

export interface Tenant {
  orgId: string;
  slug: string;
  name: string;
  /** The signed-in user's email, when there is one. Empty under the switcher. */
  email: string;
  /** False when the tenant came from the dev switcher rather than a real login. */
  authenticated: boolean;
}

export function devOrgSwitchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SITEWIREAI_DEV_ORG_SWITCH === "1";
}

function asTenant(org: OrgRow, email: string, authenticated: boolean): Tenant {
  return { orgId: org.id, slug: org.slug, name: org.name, email, authenticated };
}

export interface RequestIdentity {
  rawQuery: string;
  cookieHeader: string;
}

/**
 * The tenant a request belongs to, or null.
 *
 * Null must be treated as "render nothing", never as "render the default" — a
 * request that cannot be attributed to an organization has no business
 * receiving one's data.
 */
export async function resolveTenant(identity: RequestIdentity): Promise<Tenant | null> {
  // A verified session wins, always, before the switcher is even considered.
  const token = parseCookies(identity.cookieHeader)[SESSION_COOKIE] ?? "";
  const session = await verifySession(token);

  if (session) {
    const orgs = await listOrgs();
    const org = orgs.find((o) => o.id === session.orgId);
    // A token whose orgId names an organization that no longer exists is a
    // deleted tenant, not a default one. Signed in, no data.
    return org ? asTenant(org, session.email, true) : null;
  }

  if (devOrgSwitchEnabled()) {
    const requested = new URLSearchParams(identity.rawQuery).get("org");
    if (requested) {
      const match = await getOrgBySlug(requested);
      // An unknown slug resolves to nothing rather than silently falling back —
      // a typo should be visible, not quietly served someone else's data.
      return match ? asTenant(match, "", false) : null;
    }
    const orgs = await listOrgs();
    const first = orgs[0];
    return first ? asTenant(first, "", false) : null;
  }

  return null;
}

/** Every tenant, for the dev switcher's own UI. Never used to serve data. */
export async function listTenants(): Promise<Tenant[]> {
  return (await listOrgs()).map((o) => asTenant(o, "", false));
}
