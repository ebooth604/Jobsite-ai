/**
 * Who is asking.
 *
 * This module is deliberately the *only* place that answers that question, so
 * that swapping the mechanism is a change here and nowhere else. Everything
 * downstream takes an `orgId` it was handed and never re-derives one.
 *
 * **Today it is a development switcher, not authentication.** `?org=<slug>`
 * selects a tenant, and it is honoured only when `SITEWIREAI_DEV_ORG_SWITCH=1`
 * is set in the environment. That flag is absent in the deployed configuration,
 * so in production the parameter is ignored entirely and every request resolves
 * to the default tenant.
 *
 * It is worth being blunt about what this is and is not. A query parameter is
 * not an identity: anyone can type one. It exists so the two seeded tenants can
 * be demonstrated side by side, and so that every layer beneath it can be built
 * and tested against a real org id now rather than being retrofitted later.
 *
 * **Milestone 2 replaces the body of `resolveTenant` with a verified Cognito
 * JWT claim.** The signature does not change, the call sites do not change, and
 * the switcher disappears with the flag. That is the whole reason identity is
 * resolved in one function instead of being read from the URL wherever a
 * project id happens to be needed.
 */

import { getOrgBySlug, listOrgs, type OrgRow } from "@sitewireai/db";

export interface Tenant {
  orgId: string;
  slug: string;
  name: string;
}

/** True when the `?org=` switcher is permitted. Off unless explicitly enabled. */
export function devOrgSwitchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SITEWIREAI_DEV_ORG_SWITCH === "1";
}

function asTenant(org: OrgRow): Tenant {
  return { orgId: org.id, slug: org.slug, name: org.name };
}

/**
 * The tenant a request belongs to.
 *
 * Returns null when no tenant can be determined, which the caller must treat as
 * "render nothing" rather than "render the default". A request that cannot be
 * attributed to an org has no business receiving an org's data.
 */
export async function resolveTenant(rawQuery: string): Promise<Tenant | null> {
  const orgs = await listOrgs();
  if (orgs.length === 0) return null;

  if (devOrgSwitchEnabled()) {
    const requested = new URLSearchParams(rawQuery).get("org");
    if (requested) {
      const match = await getOrgBySlug(requested);
      // An unknown slug resolves to nothing rather than silently falling back —
      // a typo should be visible, not quietly served someone else's data.
      return match ? asTenant(match) : null;
    }
  }

  // Default tenant. In production this is the only branch that runs, and it is
  // a placeholder for the Cognito claim that replaces it.
  const first = orgs[0];
  return first ? asTenant(first) : null;
}

/** Every tenant, for the dev switcher's own UI. Never used to serve data. */
export async function listTenants(): Promise<Tenant[]> {
  return (await listOrgs()).map(asTenant);
}
