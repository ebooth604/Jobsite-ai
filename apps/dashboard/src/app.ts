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
import { detectDrift, reconcile } from "./reconcile.js";
import {
  CAPTURES,
  CONDITION_CAPTURE_SCOPE,
  CONDITIONS,
  DEMO_PROJECT,
  ESTIMATES,
  HOURS,
  SCOPE_ITEMS,
} from "./seed.js";
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
