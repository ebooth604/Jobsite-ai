/**
 * Tenant-scoped reads.
 *
 * Every function takes `orgId` as its **first** parameter, and there is no
 * unscoped overload to reach for by accident — the unscoped convenience
 * function is exactly the one that eventually gets called from a path where
 * the caller's identity was never checked.
 *
 * The scoping itself is enforced a layer down: `orgId` becomes the DynamoDB
 * partition key, so these functions cannot return another tenant's rows even
 * if the filtering here were wrong. See `client.ts`.
 *
 * The joins that used to be SQL now happen in the app. At this data volume —
 * a few dozen rows per project — loading a tenant's collections and joining in
 * memory costs milliseconds, and `reconcile()` already expects arrays.
 */

import {
  getItem,
  type OrgItem,
  putOrg,
  queryOrgs,
  queryType,
} from "./client.js";

export type OrgRow = OrgItem;

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
  imageKey?: string | null;
  classification?: unknown;
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
  const orgs = await queryOrgs();
  return orgs.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getOrgBySlug(slug: string): Promise<OrgRow | null> {
  // The tenant list is small and read once per request at most; a Query on the
  // shared partition plus a find beats maintaining a second index for it.
  return (await queryOrgs()).find((o) => o.slug === slug) ?? null;
}

export async function saveOrg(org: OrgRow): Promise<void> {
  await putOrg(org);
}

// ---- projects --------------------------------------------------------------

export async function listProjects(orgId: string): Promise<ProjectRow[]> {
  const rows = await queryType<ProjectRow>(orgId, "PROJECT");
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One project, scoped.
 *
 * Null when the id belongs to another tenant — which is what closes the
 * `?project=<id>` hole. The caller renders a 404 and the requester learns
 * nothing about whether the id exists elsewhere.
 */
export async function getProject(orgId: string, projectId: string): Promise<ProjectRow | null> {
  return getItem<ProjectRow>(orgId, "PROJECT", projectId);
}

// ---- rows beneath a project ------------------------------------------------
//
// `projectId` is optional: omitted, these return everything the tenant owns,
// which is what the portfolio surfaces want and is still safe because the
// partition is the org.

export async function listScopeItems(orgId: string, projectId?: string): Promise<ScopeItemRow[]> {
  const rows = await queryType<ScopeItemRow>(orgId, "SCOPE");
  const scoped = projectId ? rows.filter((r) => r.projectId === projectId) : rows;
  return scoped.sort((a, b) => a.id.localeCompare(b.id));
}

export async function listCaptures(orgId: string, projectId?: string): Promise<CaptureRow[]> {
  const rows = await queryType<CaptureRow>(orgId, "CAPTURE");
  const scoped = projectId ? rows.filter((r) => r.projectId === projectId) : rows;
  return scoped.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export async function listEstimates(orgId: string): Promise<EstimateRow[]> {
  const rows = await queryType<EstimateRow>(orgId, "ESTIMATE");
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

export async function listHours(orgId: string, projectId?: string): Promise<HoursRow[]> {
  const rows = await queryType<HoursRow>(orgId, "HOURS");
  const scoped = projectId ? rows.filter((r) => r.projectId === projectId) : rows;
  return scoped
    .map((r) => ({ ...r, normalizationFlags: r.normalizationFlags ?? [] }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function listConditions(orgId: string): Promise<ConditionRow[]> {
  const rows = await queryType<ConditionRow>(orgId, "CONDITION");
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}
