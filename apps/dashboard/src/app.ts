/**
 * Builds the view model from seed data and routes a path to a view. Shared by the
 * local server and the Lambda handler so both surfaces render byte-identical
 * output — a demo that behaves differently in the room than it did in rehearsal
 * is worse than no demo.
 */

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
};

export interface RenderResult {
  status: number;
  html: string;
}

/** Unknown paths fall back to the overview rather than a dead end mid-demo. */
export function renderPath(rawPath: string): RenderResult {
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;
  const view = ROUTES[path || "/"];
  const model = buildViewModel();

  if (!view) {
    return { status: 404, html: overview(model) };
  }
  return { status: 200, html: view(model) };
}
