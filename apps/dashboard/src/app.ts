/**
 * Builds the view model from seed data and routes a path to a response. Shared by
 * the local server and the Lambda handler so both surfaces render byte-identical
 * output — a demo that behaves differently in the room than it did in rehearsal
 * is worse than no demo.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bidView } from "./bid-view.js";
import { captureView } from "./capture-view.js";
import { landingView, reportView } from "./landing-view.js";
import { detectDrift, reconcile } from "./reconcile.js";
import { type ProjectData, readiness, reportKind } from "./reports.js";
import {
  ALL_PROJECTS,
  CAPTURES,
  CONDITION_CAPTURE_SCOPE,
  CONDITIONS,
  DEMO_PROJECT,
  ESTIMATES,
  HOURS,
  KILMER_CAPTURES,
  KILMER_CONDITIONS,
  KILMER_ESTIMATES,
  KILMER_HOURS,
  KILMER_SCOPE_ITEMS,
  SCOPE_ITEMS,
} from "./seed.js";
import type { Project } from "./types.js";

/** Every project's rows in one place, filtered per project on demand. */
const ALL_SCOPE_ITEMS = [...SCOPE_ITEMS, ...KILMER_SCOPE_ITEMS];
const ALL_CAPTURES = [...CAPTURES, ...KILMER_CAPTURES];
const ALL_ESTIMATES = [...ESTIMATES, ...KILMER_ESTIMATES];
const ALL_HOURS = [...HOURS, ...KILMER_HOURS];
const ALL_CONDITIONS = [...CONDITIONS, ...KILMER_CONDITIONS];

import type { ViewModel } from "./views.js";
import { alerts, dataQuality, overview, productivity } from "./views.js";

export function buildViewModel(): ViewModel {
  const factors = reconcile({
    scopeItems: SCOPE_ITEMS,
    captures: CAPTURES,
    estimates: ESTIMATES,
    hours: HOURS,
  });

  return {
    project: DEMO_PROJECT,
    scopeItems: SCOPE_ITEMS,
    captures: CAPTURES,
    estimates: ESTIMATES,
    hours: HOURS,
    factors,
    alerts: detectDrift(factors, SCOPE_ITEMS, CONDITIONS, CONDITION_CAPTURE_SCOPE),
  };
}

const ROUTES: Record<string, (m: ViewModel) => string> = {
  "/": overview,
  "/productivity": productivity,
  "/alerts": alerts,
  "/data-quality": dataQuality,
  "/capture": (m) => captureView(m.project, m.scopeItems),
  "/bid": (m) => bidView(m.project, m.hours),
};

/**
 * The compiled browser bundle, read once at cold start. It ships inside the
 * deployment artifact, so this is a local read rather than a fetch.
 */
const scriptCache = new Map<string, string>();

/** Only these names are servable — the path never reaches the filesystem raw. */
const CLIENT_SCRIPTS: Record<string, string> = {
  "/capture.js": "capture-client.js",
  "/assistant.js": "assistant-client.js",
  "/admin.js": "admin-client.js",
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

/** Unknown paths fall back to the overview rather than a dead end mid-demo. */
export function renderPath(rawPath: string): RenderResult {
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
  const model = buildViewModel();

  if (!view) {
    return { status: 404, contentType: HTML, body: overview(model) };
  }
  return { status: 200, contentType: HTML, body: view(model) };
}

/**
 * The assist endpoint. Separate from renderPath because it is asynchronous and
 * takes a request body, and because a model call has a very different failure
 * profile from rendering a page — a Bedrock outage must not take the site down.
 */
export async function handleAssist(rawBody: string): Promise<RenderResult> {
  const json = "application/json; charset=utf-8";
  try {
    const parsed = JSON.parse(rawBody || "{}") as { message?: unknown; context?: unknown };
    const { assist } = await import("./ai.js");
    const result = await assist(
      typeof parsed.message === "string" ? parsed.message : "",
      typeof parsed.context === "string" ? parsed.context : "",
      SCOPE_ITEMS,
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
export function projectData(project: Project): ProjectData {
  const scopeIds = new Set(
    ALL_SCOPE_ITEMS.filter((s) => s.projectId === project.id).map((s) => s.id),
  );
  const captures = ALL_CAPTURES.filter((c) => c.projectId === project.id);
  const captureIds = new Set(captures.map((c) => c.id));
  const scopeItems = ALL_SCOPE_ITEMS.filter((s) => s.projectId === project.id);
  const estimates = ALL_ESTIMATES.filter((e) => captureIds.has(e.captureId));
  const hours = ALL_HOURS.filter((h) => h.projectId === project.id);
  const conditions = ALL_CONDITIONS.filter((c) => captureIds.has(c.captureId));

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

export function allProjectData(): ProjectData[] {
  return ALL_PROJECTS.map(projectData);
}

/**
 * The landing page and reports are selected by query string, which renderPath
 * strips. They are routed here instead, from the full URL.
 */
export function renderWithQuery(rawUrl: string): RenderResult | null {
  const [pathPart = "/", queryPart = ""] = rawUrl.split("?");
  const path = pathPart.length > 1 ? pathPart.replace(/\/+$/, "") : pathPart;
  if (path !== "/projects" && path !== "/projects/report") return null;

  const params = new URLSearchParams(queryPart);
  const projects = allProjectData();

  if (path === "/projects") {
    return {
      status: 200,
      contentType: HTML,
      body: landingView(projects, params.get("project") ?? ""),
    };
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
 * Vision endpoint. The client only calls this once a capture's redaction gate has
 * passed, so the bytes arriving here are from the redacted render.
 */
export async function handleVision(rawBody: string): Promise<RenderResult> {
  const json = "application/json; charset=utf-8";
  try {
    const parsed = JSON.parse(rawBody || "{}") as { image?: unknown };
    const image = typeof parsed.image === "string" ? parsed.image : "";
    if (!image) throw new Error("no image supplied");

    const { describeCapture } = await import("./ai.js");
    const result = await describeCapture(image, SCOPE_ITEMS);
    return { status: 200, contentType: json, body: JSON.stringify(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
