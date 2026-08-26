/**
 * Builds the view model for one tenant and routes a path to a response. Shared
 * by the local server and the Lambda handler so both surfaces render
 * byte-identical output — a demo that behaves differently in the room than it
 * did in rehearsal is worse than no demo.
 *
 * **Every function that reads data takes an `orgId` and never derives one.**
 * Identity is resolved once, in `tenant.ts`, and threaded down. That is not
 * ceremony: the previous version read module-level seed constants, so adding a
 * second customer would have shown both of them the same rows, and
 * `/projects?project=<id>` rendered whatever id was in the URL.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "@sitewireai/db";
import { bidView } from "./bid-view.js";
import { captureView } from "./capture-view.js";
import { contactView, helpView } from "./contact-view.js";
import { demoCaptureView } from "./demo-capture-view.js";
import { landingView, reportView } from "./landing-view.js";
import { detectDrift, reconcile } from "./reconcile.js";
import { type ProjectData, readiness, reportKind } from "./reports.js";
import { readStatic, resolveDemoImage, type StaticAsset } from "./static-assets.js";
import type { CaptureOrigin } from "@sitewireai/shared-types";
import type {
  Capture,
  Condition,
  LabourHoursRecord,
  Project,
  QuantityEstimate,
  ScopeItem,
} from "./types.js";
import type { ViewModel } from "./views.js";
import { alerts, dataQuality, overview, productivity } from "./views.js";

// ---- row mapping -----------------------------------------------------------
//
// The store returns plain records; the views want the domain types. Mapping is
// explicit rather than a cast so that a field added to one side and not the
// other is a compile error instead of an undefined at render time.

const toProject = (r: db.ProjectRow): Project => ({
  id: r.id,
  name: r.name,
  address: r.address,
  province: r.province,
  dataRegion: r.dataRegion,
});

const toScopeItem = (r: db.ScopeItemRow): ScopeItem => ({
  id: r.id,
  projectId: r.projectId,
  trade: r.trade,
  description: r.description,
  unitOfMeasure: r.unitOfMeasure,
  bidQuantity: r.bidQuantity,
  budgetedUnitsPerHour: r.budgetedUnitsPerHour,
});

const toCapture = (r: db.CaptureRow): Capture => ({
  id: r.id,
  projectId: r.projectId,
  area: r.area,
  capturedAt: r.capturedAt,
  capturedBy: r.capturedBy,
  origin: r.origin as CaptureOrigin,
});

const toEstimate = (r: db.EstimateRow): QuantityEstimate => ({
  id: r.id,
  captureId: r.captureId,
  scopeItemId: r.scopeItemId,
  estimatedQuantity: r.estimatedQuantity,
  confidence: r.confidence,
  abstained: r.abstained,
  modelVersion: r.modelVersion,
});

const toHours = (r: db.HoursRow): LabourHoursRecord => ({
  id: r.id,
  projectId: r.projectId,
  scopeItemId: r.scopeItemId,
  date: r.date,
  hours: r.hours,
  sourceSystem: r.sourceSystem,
  normalizationFlags: r.normalizationFlags,
});

const toCondition = (r: db.ConditionRow): Condition => ({
  id: r.id,
  captureId: r.captureId,
  conditionType: r.conditionType,
  description: r.description,
  confidence: r.confidence,
});

/** Everything one tenant owns, fetched in parallel. */
async function tenantRows(orgId: string) {
  const [projects, scopeItems, captures, estimates, hours, conditions] = await Promise.all([
    db.listProjects(orgId),
    db.listScopeItems(orgId),
    db.listCaptures(orgId),
    db.listEstimates(orgId),
    db.listHours(orgId),
    db.listConditions(orgId),
  ]);
  return {
    projects: projects.map(toProject),
    scopeItems: scopeItems.map(toScopeItem),
    captures: captures.map(toCapture),
    estimates: estimates.map(toEstimate),
    hours: hours.map(toHours),
    conditions: conditions.map(toCondition),
  };
}

// ---- view model ------------------------------------------------------------

/**
 * The tenant's headline view: their most active project, reconciled.
 *
 * "Most active" rather than "first" because first-by-name lands on Fraser
 * Exchange — a project that deliberately has no captures yet — and an overview
 * page whose every tile reads zero looks like a broken deployment rather than
 * an accurate one. The project with the most captures is the one someone
 * opening the dashboard is most likely to be asking about.
 *
 * A project selector belongs here eventually. What matters for now is that the
 * choice comes from the tenant's own projects rather than a hardcoded constant.
 */
export async function buildViewModel(orgId: string): Promise<ViewModel | null> {
  const rows = await tenantRows(orgId);

  const captureCount = new Map<string, number>();
  for (const c of rows.captures) {
    captureCount.set(c.projectId, (captureCount.get(c.projectId) ?? 0) + 1);
  }
  const project = [...rows.projects].sort(
    (a, b) =>
      (captureCount.get(b.id) ?? 0) - (captureCount.get(a.id) ?? 0) || a.name.localeCompare(b.name),
  )[0];
  if (!project) return null;

  const scopeItems = rows.scopeItems.filter((s) => s.projectId === project.id);
  const captureIds = new Set(
    rows.captures.filter((c) => c.projectId === project.id).map((c) => c.id),
  );
  const captures = rows.captures.filter((c) => captureIds.has(c.id));
  const estimates = rows.estimates.filter((e) => captureIds.has(e.captureId));
  const hours = rows.hours.filter((h) => h.projectId === project.id);
  const conditions = rows.conditions.filter((c) => captureIds.has(c.captureId));

  const factors = reconcile({ scopeItems, captures, estimates, hours });

  // capture id → scope item id, so a condition can be tied back to a scope item.
  const conditionScope = new Map(estimates.map((e) => [e.captureId, e.scopeItemId]));

  return {
    project,
    scopeItems,
    captures,
    estimates,
    hours,
    factors,
    alerts: detectDrift(factors, scopeItems, conditions, conditionScope),
  };
}

const ROUTES: Record<string, (m: ViewModel) => string> = {
  "/capture/demo": () => demoCaptureView(resolveDemoImage()),
  "/": overview,
  "/productivity": productivity,
  "/alerts": alerts,
  "/data-quality": dataQuality,
  "/capture": (m) => captureView(m.project, m.scopeItems),
  "/contact": () => contactView(),
  "/help": () => helpView(),
  "/bid": (m) => bidView(m.project, m.hours),
};

/** Paths that render without any tenant data, so they work signed-out. */
const PUBLIC_ROUTES = new Set(["/contact", "/help", "/capture/demo"]);

const scriptCache = new Map<string, string>();

/** Only these names are servable — the path never reaches the filesystem raw. */
const CLIENT_SCRIPTS: Record<string, string> = {
  "/capture.js": "capture-client.js",
  "/assistant.js": "assistant-client.js",
  "/contact.js": "contact-client.js",
  "/bid.js": "bid-client.js",
};

function clientScript(file: string): string {
  const cached = scriptCache.get(file);
  if (cached !== undefined) return cached;
  const here = dirname(fileURLToPath(import.meta.url));
  const text = readFileSync(join(here, "client", file), "utf8");
  scriptCache.set(file, text);
  return text;
}

export interface RenderResult {
  status: number;
  contentType: string;
  body: string;
}

const HTML = "text/html; charset=utf-8";

/** Shown when a request cannot be attributed to a tenant, or the tenant is empty. */
function noTenant(message: string): RenderResult {
  return {
    status: 404,
    contentType: HTML,
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Not available — SiteWireAi</title></head><body
style="font:15px/1.6 system-ui,sans-serif;max-width:44rem;margin:6rem auto;padding:0 1.5rem">
<h1 style="font-size:1.3rem">Nothing to show</h1>
<p>${message}</p></body></html>`,
  };
}

export function renderStatic(rawPath: string): StaticAsset | null {
  if (!rawPath.startsWith("/static/")) return null;
  return readStatic(rawPath);
}

/**
 * Renders a path for one tenant.
 *
 * An unknown path falls back to the overview rather than a dead end mid-demo,
 * but it does so with a 404 status so the fallback is not mistaken for a route.
 */
export async function renderPath(rawPath: string, orgId: string | null): Promise<RenderResult> {
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

  const scriptFile = CLIENT_SCRIPTS[path];
  if (scriptFile) {
    return {
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: clientScript(scriptFile),
    };
  }

  const view = ROUTES[path || "/"];

  // Public pages render before any tenant lookup, so they still work when
  // nobody is signed in and when the store is unreachable.
  if (view && PUBLIC_ROUTES.has(path)) {
    return { status: 200, contentType: HTML, body: view({} as ViewModel) };
  }

  if (!orgId) {
    return noTenant("This request could not be matched to an organization.");
  }

  const model = await buildViewModel(orgId);
  if (!model) {
    return noTenant("This organization has no projects yet.");
  }

  if (!view) {
    return { status: 404, contentType: HTML, body: overview(model) };
  }
  return { status: 200, contentType: HTML, body: view(model) };
}

/**
 * The assist endpoint. Separate from renderPath because it is asynchronous and
 * takes a request body, and because a model call has a very different failure
 * profile from rendering a page — a model outage must not take the site down.
 */
export async function handleAssist(rawBody: string, orgId: string | null): Promise<RenderResult> {
  const json = "application/json; charset=utf-8";
  try {
    if (!orgId) throw new Error("no organization for this request");
    const parsed = JSON.parse(rawBody || "{}") as { message?: unknown; context?: unknown };
    const { assist } = await import("./ai.js");
    // The caller's own scope items, so the model can only ever propose an id
    // this tenant owns.
    const scopeItems = (await db.listScopeItems(orgId)).map(toScopeItem);
    const result = await assist(
      typeof parsed.message === "string" ? parsed.message : "",
      typeof parsed.context === "string" ? parsed.context : "",
      scopeItems,
    );
    return { status: 200, contentType: json, body: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 502,
      contentType: json,
      body: JSON.stringify({ reply: `Assistant unavailable — ${message}`, actions: [] }),
    };
  }
}

/** Per-project data, reconciled independently so one project's gaps stay its own. */
function assembleProject(
  project: Project,
  rows: Awaited<ReturnType<typeof tenantRows>>,
): ProjectData {
  const scopeItems = rows.scopeItems.filter((s) => s.projectId === project.id);
  const scopeIds = new Set(scopeItems.map((s) => s.id));
  const captures = rows.captures.filter((c) => c.projectId === project.id);
  const captureIds = new Set(captures.map((c) => c.id));
  const estimates = rows.estimates.filter((e) => captureIds.has(e.captureId));
  const hours = rows.hours.filter((h) => h.projectId === project.id);
  const conditions = rows.conditions.filter((c) => captureIds.has(c.captureId));

  return {
    project,
    scopeItems,
    captures,
    estimates,
    hours,
    conditions,
    factors: reconcile({ scopeItems, captures, estimates, hours }).filter((f) =>
      scopeIds.has(f.scopeItemId),
    ),
  };
}

/** Every project this tenant owns. Never every project that exists. */
export async function allProjectData(orgId: string): Promise<ProjectData[]> {
  const rows = await tenantRows(orgId);
  return rows.projects.map((p) => assembleProject(p, rows));
}

/**
 * The landing page and reports are selected by query string, which renderPath
 * strips. They are routed here instead, from the full URL.
 *
 * **This is where the tenancy hole was.** The previous version looked a
 * requested project id up in a list of *every* project, so any id in the URL
 * rendered. It now resolves against the caller's own projects only, and an id
 * belonging to another tenant is indistinguishable from one that does not
 * exist — a 404 either way, leaking nothing about what other tenants own.
 */
export async function renderWithQuery(
  rawUrl: string,
  orgId: string | null,
): Promise<RenderResult | null> {
  const [pathPart = "/", queryPart = ""] = rawUrl.split("?");
  const path = pathPart.length > 1 ? pathPart.replace(/\/+$/, "") : pathPart;
  if (path !== "/projects" && path !== "/projects/report") return null;

  if (!orgId) return noTenant("This request could not be matched to an organization.");

  const params = new URLSearchParams(queryPart);
  const projects = await allProjectData(orgId);

  if (path === "/projects") {
    const requested = params.get("project") ?? "";
    // A project id this tenant does not own selects nothing rather than 404ing
    // the whole page — the portfolio is still theirs to look at.
    const selected = projects.some((d) => d.project.id === requested) ? requested : "";
    return { status: 200, contentType: HTML, body: landingView(projects, selected) };
  }

  const data = projects.find((d) => d.project.id === params.get("project"));
  const kind = reportKind(params.get("kind") ?? "");
  if (!data || !kind) {
    return { status: 404, contentType: HTML, body: landingView(projects, "") };
  }

  // A report whose figures do not resolve is never rendered, even if its URL is
  // typed directly — the readiness gate is not just a disabled button.
  if (!readiness(data, kind).ready) {
    return {
      status: 409,
      contentType: HTML,
      body: landingView(projects, data.project.id),
    };
  }

  return { status: 200, contentType: HTML, body: reportView(data, kind) };
}

/**
 * Vision endpoint. The client only calls this once a capture's redaction gate
 * has passed, so the bytes arriving here are from the redacted render.
 */
export async function handleVision(rawBody: string, orgId: string | null): Promise<RenderResult> {
  const json = "application/json; charset=utf-8";
  try {
    if (!orgId) throw new Error("no organization for this request");
    const parsed = JSON.parse(rawBody || "{}") as { image?: unknown };
    const image = typeof parsed.image === "string" ? parsed.image : "";
    if (!image) throw new Error("no image supplied");

    const { describeCapture } = await import("./ai.js");
    const scopeItems = (await db.listScopeItems(orgId)).map(toScopeItem);
    const result = await describeCapture(image, scopeItems);
    return { status: 200, contentType: json, body: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Shape-identical to the success case on purpose: the capture client reads
    // res.json() without checking res.ok, and any other body would throw there.
    return {
      status: 502,
      contentType: json,
      body: JSON.stringify({ description: `Could not read that photo — ${message}`, fields: {} }),
    };
  }
}

/** Reads one compiled browser bundle by file name. Used by the admin mount. */
export function captureClientScriptFor(file: string): string {
  return clientScript(file);
}
