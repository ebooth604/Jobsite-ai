/**
 * Builds the dashboard model from seed data. Shared by the local server and the
 * Lambda handler so both surfaces render byte-identical output — a demo that
 * behaves differently in the room than it did in rehearsal is worse than no demo.
 */

import { detectDrift, reconcile } from "./reconcile.js";
import { renderDashboard } from "./render.js";
import {
  CAPTURES,
  CONDITION_CAPTURE_SCOPE,
  CONDITIONS,
  DEMO_PROJECT,
  ESTIMATES,
  HOURS,
  SCOPE_ITEMS,
} from "./seed.js";

export function buildDashboardHtml(): string {
  const factors = reconcile({
    scopeItems: SCOPE_ITEMS,
    captures: CAPTURES,
    estimates: ESTIMATES,
    hours: HOURS,
  });

  const alerts = detectDrift(factors, SCOPE_ITEMS, CONDITIONS, CONDITION_CAPTURE_SCOPE);

  return renderDashboard({
    project: DEMO_PROJECT,
    scopeItems: SCOPE_ITEMS,
    captures: CAPTURES,
    estimates: ESTIMATES,
    hours: HOURS,
    factors,
    alerts,
  });
}
