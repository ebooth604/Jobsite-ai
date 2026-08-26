/**
 * Applies the schema and loads the synthetic tenants.
 *
 * Idempotent by construction: `schema.sql` is all `CREATE TABLE IF NOT EXISTS`,
 * and every insert is `ON CONFLICT (id) DO UPDATE`. Re-running it converges the
 * database on the seed rather than erroring or duplicating, which is what you
 * want from something run by hand against a demo environment.
 *
 * The Data API runs one statement per call, so `schema.sql` is split on `;` and
 * replayed. That is fine for a file we control and would be wrong for arbitrary
 * SQL — a semicolon inside a string literal or a dollar-quoted function body
 * would split in the wrong place. If this file ever grows a trigger or a
 * function, this splitter needs to go.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execute, query } from "./client.js";
import { type SeedOrg, SEED_ORGS } from "./seed.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `dist/` sits one level below the package root, where schema.sql lives. */
function schemaPath(): string {
  return join(HERE, "..", "schema.sql");
}

function statements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.split("\n").every((line) => line.trim().startsWith("--")));
}

export async function applySchema(): Promise<number> {
  const sql = readFileSync(schemaPath(), "utf8");
  const parts = statements(sql);
  for (const part of parts) await execute(part);
  return parts.length;
}

async function seedOrg(org: SeedOrg): Promise<void> {
  await execute(
    `INSERT INTO organizations (id, name, slug) VALUES (:id, :name, :slug)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
    { id: org.id, name: org.name, slug: org.slug },
  );

  for (const p of org.projects) {
    await execute(
      `INSERT INTO projects (id, org_id, name, address, province, data_region)
       VALUES (:id, :orgId, :name, :address, :province, 'ca-central-1')
       ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, name = EXCLUDED.name,
         address = EXCLUDED.address, province = EXCLUDED.province`,
      { id: p.id, orgId: org.id, name: p.name, address: p.address, province: p.province },
    );
  }

  for (const s of org.scopeItems) {
    await execute(
      `INSERT INTO scope_items (id, org_id, project_id, trade, description,
         unit_of_measure, bid_quantity, budgeted_units_per_hour)
       VALUES (:id, :orgId, :projectId, :trade, :description, :unit, :bid, :rate)
       ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id,
         project_id = EXCLUDED.project_id, trade = EXCLUDED.trade,
         description = EXCLUDED.description, unit_of_measure = EXCLUDED.unit_of_measure,
         bid_quantity = EXCLUDED.bid_quantity,
         budgeted_units_per_hour = EXCLUDED.budgeted_units_per_hour`,
      {
        id: s.id,
        orgId: org.id,
        projectId: s.projectId,
        trade: s.trade,
        description: s.description,
        unit: s.unitOfMeasure,
        bid: s.bidQuantity,
        rate: s.budgetedUnitsPerHour,
      },
    );
  }

  for (const c of org.captures) {
    await execute(
      `INSERT INTO captures (id, org_id, project_id, area, captured_at, captured_by, origin)
       VALUES (:id, :orgId, :projectId, :area, :capturedAt, :capturedBy, 'simulated')
       ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id,
         project_id = EXCLUDED.project_id, area = EXCLUDED.area,
         captured_at = EXCLUDED.captured_at, captured_by = EXCLUDED.captured_by`,
      {
        id: c.id,
        orgId: org.id,
        projectId: c.projectId,
        area: c.area,
        capturedAt: c.capturedAt,
        capturedBy: c.capturedBy,
      },
    );
  }

  for (const e of org.estimates) {
    await execute(
      `INSERT INTO quantity_estimates (id, org_id, capture_id, scope_item_id,
         estimated_quantity, confidence, abstained, model_version)
       VALUES (:id, :orgId, :captureId, :scopeItemId, :qty, :confidence, :abstained, :model)
       ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id,
         capture_id = EXCLUDED.capture_id, scope_item_id = EXCLUDED.scope_item_id,
         estimated_quantity = EXCLUDED.estimated_quantity,
         confidence = EXCLUDED.confidence, abstained = EXCLUDED.abstained,
         model_version = EXCLUDED.model_version`,
      {
        id: e.id,
        orgId: org.id,
        captureId: e.captureId,
        scopeItemId: e.scopeItemId,
        qty: e.estimatedQuantity,
        confidence: e.confidence,
        abstained: e.abstained,
        model: e.modelVersion,
      },
    );
  }

  for (const h of org.hours) {
    await execute(
      `INSERT INTO labour_hours (id, org_id, project_id, scope_item_id, date, hours,
         source_system, normalization_flags)
       VALUES (:id, :orgId, :projectId, :scopeItemId, :date, :hours, :source,
         CAST(:flags AS text[]))
       ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id,
         project_id = EXCLUDED.project_id, scope_item_id = EXCLUDED.scope_item_id,
         date = EXCLUDED.date, hours = EXCLUDED.hours,
         source_system = EXCLUDED.source_system,
         normalization_flags = EXCLUDED.normalization_flags`,
      {
        id: h.id,
        orgId: org.id,
        projectId: h.projectId,
        scopeItemId: h.scopeItemId,
        date: h.date,
        hours: h.hours,
        source: h.sourceSystem,
        // The Data API has no array binding that survives a text[] column
        // cleanly, so the literal is built here and cast. Values are ours, from
        // the seed file, never user input.
        flags: `{${h.normalizationFlags.map((f) => `"${f}"`).join(",")}}`,
      },
    );
  }

  for (const c of org.conditions) {
    await execute(
      `INSERT INTO conditions (id, org_id, capture_id, condition_type, description, confidence)
       VALUES (:id, :orgId, :captureId, :type, :description, :confidence)
       ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id,
         capture_id = EXCLUDED.capture_id, condition_type = EXCLUDED.condition_type,
         description = EXCLUDED.description, confidence = EXCLUDED.confidence`,
      {
        id: c.id,
        orgId: org.id,
        captureId: c.captureId,
        type: c.conditionType,
        description: c.description,
        confidence: c.confidence,
      },
    );
  }
}

export async function seedAll(): Promise<void> {
  for (const org of SEED_ORGS) await seedOrg(org);
}

/** What landed, per org — printed after a run so the result is visible. */
export async function summarise(): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  const orgs = await query<{ id: string; slug: string }>(
    "SELECT id, slug FROM organizations ORDER BY slug",
  );

  for (const org of orgs) {
    const counts: Record<string, number> = {};
    for (const table of [
      "projects",
      "scope_items",
      "captures",
      "quantity_estimates",
      "labour_hours",
      "conditions",
    ]) {
      const rows = await query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${table} WHERE org_id = :orgId`,
        { orgId: org.id },
      );
      counts[table] = rows[0]?.n ?? 0;
    }
    out[org.slug] = counts;
  }
  return out;
}
