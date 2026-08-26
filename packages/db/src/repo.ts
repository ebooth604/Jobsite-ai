/**
 * Tenant-scoped reads.
 *
 * Every function here takes `orgId` as its **first** parameter and puts it in
 * the WHERE clause of the table being read — not of a table it joins to. That
 * is the single rule this file exists to enforce, and it is worth stating why
 * it is a rule rather than a habit:
 *
 * A query that forgets `org_id` returns another tenant's rows. It does not
 * error, it does not look wrong in review, and in a demo with one customer it
 * behaves identically to a correct one. The failure surfaces the day a second
 * customer logs in, as their competitor's jobsite photographs.
 *
 * So there is no `getProject(id)` here, only `getProject(orgId, id)`. The
 * unscoped convenience overload is the exact function that eventually gets
 * called from a path where the caller's identity was never checked.
 */

import { type Param, query } from "./client.js";

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  address: string;
  province: string;
  dataRegion: string;
}

export interface ScopeItemRow {
  id: string;
  projectId: string;
  trade: string;
  description: string;
  unitOfMeasure: string;
  bidQuantity: number;
  budgetedUnitsPerHour: number;
}

export interface CaptureRow {
  id: string;
  projectId: string;
  area: string;
  capturedAt: string;
  capturedBy: string;
  origin: string;
  imageKey: string | null;
  classification: unknown;
}

export interface EstimateRow {
  id: string;
  captureId: string;
  scopeItemId: string;
  estimatedQuantity: number | null;
  confidence: number;
  abstained: boolean;
  modelVersion: string;
}

export interface HoursRow {
  id: string;
  projectId: string;
  scopeItemId: string | null;
  date: string;
  hours: number;
  sourceSystem: string;
  normalizationFlags: string[];
}

export interface ConditionRow {
  id: string;
  captureId: string;
  conditionType: string;
  description: string;
  confidence: number;
}

// ---- organizations ---------------------------------------------------------

export async function listOrgs(): Promise<OrgRow[]> {
  return query<OrgRow>("SELECT id, name, slug FROM organizations ORDER BY name");
}

export async function getOrgBySlug(slug: string): Promise<OrgRow | null> {
  const rows = await query<OrgRow>(
    "SELECT id, name, slug FROM organizations WHERE slug = :slug",
    { slug },
  );
  return rows[0] ?? null;
}

// ---- projects --------------------------------------------------------------

export async function listProjects(orgId: string): Promise<ProjectRow[]> {
  return query<ProjectRow>(
    `SELECT id, name, address, province, data_region AS "dataRegion"
       FROM projects WHERE org_id = :orgId ORDER BY name`,
    { orgId },
  );
}

/**
 * One project, scoped.
 *
 * Returns null when the id belongs to another tenant, which is what closes the
 * `?project=<id>` hole — the caller renders a 404 and learns nothing about
 * whether the id exists elsewhere.
 */
export async function getProject(orgId: string, projectId: string): Promise<ProjectRow | null> {
  const rows = await query<ProjectRow>(
    `SELECT id, name, address, province, data_region AS "dataRegion"
       FROM projects WHERE org_id = :orgId AND id = :projectId`,
    { orgId, projectId },
  );
  return rows[0] ?? null;
}

// ---- rows beneath a project ------------------------------------------------
//
// Each takes an optional projectId. Omitted, it returns everything the org owns
// — which is what the portfolio surfaces want, and is still tenant-safe because
// org_id is on every one of these tables.

function scoped(orgId: string, projectId?: string): Record<string, Param> {
  return projectId ? { orgId, projectId } : { orgId };
}

const byProject = (projectId?: string) => (projectId ? " AND project_id = :projectId" : "");

export async function listScopeItems(orgId: string, projectId?: string): Promise<ScopeItemRow[]> {
  return query<ScopeItemRow>(
    `SELECT id, project_id AS "projectId", trade, description,
            unit_of_measure AS "unitOfMeasure", bid_quantity AS "bidQuantity",
            budgeted_units_per_hour AS "budgetedUnitsPerHour"
       FROM scope_items WHERE org_id = :orgId${byProject(projectId)} ORDER BY id`,
    scoped(orgId, projectId),
  );
}

export async function listCaptures(orgId: string, projectId?: string): Promise<CaptureRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, project_id AS "projectId", area, captured_at AS "capturedAt",
            captured_by AS "capturedBy", origin, image_key AS "imageKey",
            classification::text AS classification
       FROM captures WHERE org_id = :orgId${byProject(projectId)} ORDER BY captured_at DESC`,
    scoped(orgId, projectId),
  );
  return rows.map((r) => ({
    ...r,
    // jsonb comes back as text; a malformed value must not take the page down.
    classification: r.classification ? safeJson(String(r.classification)) : null,
  })) as CaptureRow[];
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function listEstimates(orgId: string): Promise<EstimateRow[]> {
  return query<EstimateRow>(
    `SELECT id, capture_id AS "captureId", scope_item_id AS "scopeItemId",
            estimated_quantity AS "estimatedQuantity", confidence, abstained,
            model_version AS "modelVersion"
       FROM quantity_estimates WHERE org_id = :orgId ORDER BY id`,
    { orgId },
  );
}

export async function listHours(orgId: string, projectId?: string): Promise<HoursRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT id, project_id AS "projectId", scope_item_id AS "scopeItemId", date, hours,
            source_system AS "sourceSystem", normalization_flags AS "normalizationFlags"
       FROM labour_hours WHERE org_id = :orgId${byProject(projectId)} ORDER BY date`,
    scoped(orgId, projectId),
  );
  return rows.map((r) => ({
    ...r,
    normalizationFlags: Array.isArray(r.normalizationFlags) ? r.normalizationFlags : [],
  })) as HoursRow[];
}

export async function listConditions(orgId: string): Promise<ConditionRow[]> {
  return query<ConditionRow>(
    `SELECT id, capture_id AS "captureId", condition_type AS "conditionType",
            description, confidence
       FROM conditions WHERE org_id = :orgId ORDER BY id`,
    { orgId },
  );
}
