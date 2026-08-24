/**
 * Server-rendered dashboard. No client framework: the demo has to load instantly
 * on a stranger's laptop in a meeting room, and nothing here needs interactivity.
 *
 * The provenance banner is not decoration. Every figure below is computed from
 * invented captures, so the page says so once, loudly — the alternative is a
 * table an investor could reasonably mistake for measured performance.
 */

import type {
  Alert,
  Capture,
  LabourHoursRecord,
  ProductivityFactor,
  Project,
  QuantityEstimate,
  ScopeItem,
} from "./types.js";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

const factorClass = (factor: number): string =>
  factor < 0.7 ? "critical" : factor < 0.85 ? "warning" : "ok";

export interface DashboardModel {
  project: Project;
  scopeItems: ScopeItem[];
  captures: Capture[];
  estimates: QuantityEstimate[];
  hours: LabourHoursRecord[];
  factors: ProductivityFactor[];
  alerts: Alert[];
}

function renderFactorRows(model: DashboardModel): string {
  const scopeById = new Map(model.scopeItems.map((s) => [s.id, s]));
  return model.factors
    .map((f) => {
      const scope = scopeById.get(f.scopeItemId);
      if (!scope) return "";
      return [
        "<tr>",
        `<td><strong>${escapeHtml(scope.trade)}</strong><br>`,
        `<span class="muted">${escapeHtml(scope.description)}</span></td>`,
        `<td>${escapeHtml(f.date)}</td>`,
        `<td class="num">${f.installedQuantity} ${escapeHtml(scope.unitOfMeasure)}</td>`,
        `<td class="num">${f.hours}</td>`,
        `<td class="num">${f.actualRate.toFixed(2)}</td>`,
        `<td class="num">${f.budgetedRate.toFixed(2)}</td>`,
        `<td class="num"><span class="pill ${factorClass(f.factor)}">`,
        `${f.factor.toFixed(2)}</span></td>`,
        "</tr>",
      ].join("");
    })
    .join("");
}

function renderAlerts(alerts: Alert[]): string {
  if (alerts.length === 0) {
    return '<p class="muted">No scope items are drifting below the alert threshold.</p>';
  }

  return alerts
    .map((a) => {
      const conditions = a.correlatedConditions.length
        ? [
            '<div class="conditions"><span class="muted">',
            "Correlated conditions on the same captures:</span><ul>",
            a.correlatedConditions
              .map(
                (c) =>
                  `<li>${escapeHtml(c.description)} <span class="muted">(${escapeHtml(
                    c.conditionType,
                  )}, confidence ${c.confidence.toFixed(2)})</span></li>`,
              )
              .join(""),
            "</ul></div>",
          ].join("")
        : '<div class="muted">No correlated conditions detected.</div>';

      return [
        `<div class="alert ${escapeHtml(a.severity)}">`,
        `<div class="alert-head">${escapeHtml(a.severity.toUpperCase())} · `,
        `${escapeHtml(a.createdAt)}</div>`,
        `<div class="alert-msg">${escapeHtml(a.message)}</div>`,
        conditions,
        "</div>",
      ].join("");
    })
    .join("");
}

function renderDataQuality(estimates: QuantityEstimate[], hours: LabourHoursRecord[]): string {
  const abstentions = estimates.filter((e) => e.abstained);
  const flagged = hours.filter((h) => h.normalizationFlags.length > 0);
  const notes: string[] = [];

  if (flagged.length) {
    const reasons = flagged.map((h) => escapeHtml(h.normalizationFlags.join(", "))).join("; ");
    notes.push(
      `${flagged.length} labour-hours record(s) held back from the join: ${reasons}. ` +
        "These are surfaced rather than joined, so a bad cost code cannot silently " +
        "become a productivity factor.",
    );
  }

  if (abstentions.length) {
    notes.push(
      `${abstentions.length} estimate(s) abstained — the model declined to guess ` +
        "rather than return a low-confidence number. An abstention is absent from " +
        "the maths, not counted as zero installed quantity.",
    );
  }

  if (notes.length === 0) {
    return '<span class="muted">No held-back records.</span>';
  }
  return `<ul>${notes.map((n) => `<li>${n}</li>`).join("")}</ul>`;
}

const STYLES = `
  :root {
    --bg: #f6f7f9; --panel: #ffffff; --ink: #16191d; --muted: #6b7280;
    --line: #e3e6ea; --ok: #0f7b4f; --warn: #a35c00; --crit: #b3261e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14171a; --panel: #1c2024; --ink: #eceff3; --muted: #9aa3ad;
      --line: #2b3138; --ok: #4ec98b; --warn: #e0a44a; --crit: #ef6f66;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 24px 20px 64px; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline;
    justify-content: space-between; margin-bottom: 8px; }
  h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em;
    color: var(--muted); margin: 32px 0 12px; }
  .muted { color: var(--muted); }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 999px;
    border: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  .banner { border: 1px solid var(--warn); border-left-width: 4px;
    background: color-mix(in srgb, var(--warn) 10%, transparent);
    padding: 12px 14px; border-radius: 6px; margin: 16px 0 4px; }
  .banner strong { color: var(--warn); }
  .panel { background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 4px 16px 16px; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 640px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase;
    letter-spacing: .05em; color: var(--muted); padding: 12px 8px;
    border-bottom: 1px solid var(--line); font-weight: 600; }
  td { padding: 12px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; padding: 2px 10px; border-radius: 999px;
    font-weight: 600; font-variant-numeric: tabular-nums; }
  .pill.ok { background: color-mix(in srgb, var(--ok) 16%, transparent); color: var(--ok); }
  .pill.warning { background: color-mix(in srgb, var(--warn) 16%, transparent);
    color: var(--warn); }
  .pill.critical { background: color-mix(in srgb, var(--crit) 16%, transparent);
    color: var(--crit); }
  .alert { border: 1px solid var(--line); border-left-width: 4px; border-radius: 6px;
    padding: 12px 14px; margin-bottom: 10px; background: var(--panel); }
  .alert.critical { border-left-color: var(--crit); }
  .alert.warning { border-left-color: var(--warn); }
  .alert-head { font-size: 12px; letter-spacing: .06em; color: var(--muted); }
  .alert-msg { font-weight: 600; margin: 4px 0 8px; }
  .conditions ul { margin: 6px 0 0; padding-left: 18px; }
  .note { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px;
    background: var(--panel); }
  .note ul { margin: 0; padding-left: 18px; }
  .note li { margin-bottom: 8px; }
  .note li:last-child { margin-bottom: 0; }
  code { font-size: 13px; }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line);
    font-size: 13px; color: var(--muted); }
`;

export function renderDashboard(model: DashboardModel): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sitewire — ${escapeHtml(model.project.name)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="wrap">

  <header>
    <div>
      <h1>${escapeHtml(model.project.name)}</h1>
      <div class="muted">${escapeHtml(model.project.address)} · ${escapeHtml(
        model.project.province,
      )}</div>
    </div>
    <div>
      <span class="badge">Data region ${escapeHtml(model.project.dataRegion)}</span>
      <span class="badge">Faces blurred at ingest</span>
    </div>
  </header>

  <div class="banner">
    <strong>Simulated data.</strong> Every capture on this page is
    <code>origin: "simulated"</code> — invented for demonstration, not recorded on a
    jobsite. This page shows <em>how a productivity factor is derived</em>. It
    deliberately reports no model-accuracy figure: simulated captures may train a
    model and may never measure one, so an accuracy number computed here would be
    meaningless.
  </div>

  <h2>Productivity factors</h2>
  <div class="panel scroll">
    <table>
      <thead><tr>
        <th>Scope item</th><th>Date</th><th class="num">Installed</th>
        <th class="num">Hours</th><th class="num">Actual /hr</th>
        <th class="num">Bid /hr</th><th class="num">Factor</th>
      </tr></thead>
      <tbody>${renderFactorRows(model)}</tbody>
    </table>
  </div>
  <p class="muted">Factor is actual install rate ÷ bid rate. Below 1.00 is slower
  than bid.</p>

  <h2>Alerts</h2>
  ${renderAlerts(model.alerts)}

  <h2>Data quality</h2>
  <div class="note">${renderDataQuality(model.estimates, model.hours)}</div>

  <h2>What this dashboard will not show</h2>
  <div class="note">
    <ul>
      <li><strong>No individual-worker productivity view.</strong> Captures carry a
      <code>captured_by</code> field for provenance, and nothing groups by it. There
      is no table, column, or derived view that aggregates installed quantity per
      worker — the constraint sits in the schema, not just in the UI.</li>
      <li><strong>No accuracy claim from invented data.</strong> Accuracy is reported
      only against a held-out set of field and self-measured captures.</li>
    </ul>
  </div>

  <footer>
    Sitewire demo · ${model.captures.length} simulated captures ·
    ${model.factors.length} reconciled factor(s) · served from
    ${escapeHtml(model.project.dataRegion)}
  </footer>

</div>
</body>
</html>`;
}
