/**
 * Loads the synthetic tenants into the domain table.
 *
 * There is no schema step — DynamoDB has none, and the table itself is created
 * by Terraform. This is purely the seed.
 *
 * Idempotent: every write is a Put on a deterministic key, so re-running
 * converges the table on the seed rather than duplicating. That is what you
 * want from something run by hand against a demo environment.
 */

import { type EntityType, putMany, putOrg } from "./client.js";
import { queryType } from "./client.js";
import { type SeedOrg, SEED_ORGS } from "./seed.js";

interface Pending {
  orgId: string;
  type: EntityType;
  id: string;
  attributes: Record<string, unknown>;
}

function pendingFor(org: SeedOrg): Pending[] {
  const items: Pending[] = [];
  const add = (type: EntityType, id: string, attributes: Record<string, unknown>) =>
    items.push({ orgId: org.id, type, id, attributes });

  for (const p of org.projects) {
    add("PROJECT", p.id, { ...p, dataRegion: "ca-central-1" });
  }
  for (const s of org.scopeItems) add("SCOPE", s.id, s);
  for (const c of org.captures) {
    // Every seeded capture is invented, not recorded on a jobsite. The rule that
    // governs it is unchanged: simulated data may train a model and may never
    // measure one.
    add("CAPTURE", c.id, { ...c, origin: "simulated", imageKey: null, classification: null });
  }
  for (const e of org.estimates) add("ESTIMATE", e.id, e);
  for (const h of org.hours) add("HOURS", h.id, h);
  for (const c of org.conditions) add("CONDITION", c.id, c);

  return items;
}

export async function seedAll(): Promise<void> {
  for (const org of SEED_ORGS) {
    await putOrg({ id: org.id, name: org.name, slug: org.slug });
    await putMany(pendingFor(org));
  }
}

/** What landed, per org — printed after a run so the result is visible. */
export async function summarise(): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  const types: EntityType[] = ["PROJECT", "SCOPE", "CAPTURE", "ESTIMATE", "HOURS", "CONDITION"];

  for (const org of SEED_ORGS) {
    const counts: Record<string, number> = {};
    for (const type of types) {
      counts[type] = (await queryType(org.id, type)).length;
    }
    out[org.slug] = counts;
  }
  return out;
}
