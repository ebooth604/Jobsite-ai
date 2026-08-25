/**
 * The four views. Each takes the same reconciled model and renders one question:
 * where do we stand, what are the numbers, what needs attention, what did we
 * refuse to compute.
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
import type { FactorBar, StatTile } from "./ui.js";
import { escapeHtml, factorChart, page, statTiles, statusFor, statusPill } from "./ui.js";

export interface ViewModel {
  project: Project;
  scopeItems: ScopeItem[];
  captures: Capture[];
  estimates: QuantityEstimate[];
  hours: LabourHoursRecord[];
  factors: ProductivityFactor[];
  alerts: Alert[];
}

const footerFor = (m: ViewModel): string =>
  `SiteWireAi demo · ${m.captures.length} simulated captures · ${m.factors.length} reconciled factor(s) · served from ${m.project.dataRegion}`;

function scopeMap(m: ViewModel): Map<string, ScopeItem> {
  return new Map(m.scopeItems.map((s) => [s.id, s]));
}

function bars(m: ViewModel): FactorBar[] {
  const scopes = scopeMap(m);
  return m.factors.map((f) => {
    const scope = scopes.get(f.scopeItemId);
    return {
      label: scope ? scope.trade : f.scopeItemId,
      sublabel: scope ? scope.description : f.date,
      factor: f.factor,
    };
  });
}

function alertCards(m: ViewModel): string {
  if (m.alerts.length === 0) {
    return '<div class="empty">No scope item is drifting below the alert threshold.</div>';
  }
  return m.alerts
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
        `<div class="alert-head">${escapeHtml(a.severity.toUpperCase())} · ${escapeHtml(a.createdAt)}</div>`,
        `<div class="alert-msg">${escapeHtml(a.message)}</div>`,
        conditions,
        "</div>",
      ].join("");
    })
    .join("");
}

function factorTable(m: ViewModel): string {
  const scopes = scopeMap(m);
  const rows = m.factors
    .map((f) => {
      const scope = scopes.get(f.scopeItemId);
      if (!scope) return "";
      return [
        "<tr>",
        `<td><strong>${escapeHtml(scope.trade)}</strong><br><span class="muted">${escapeHtml(scope.description)}</span></td>`,
        `<td>${escapeHtml(f.date)}</td>`,
        `<td class="num">${f.installedQuantity} ${escapeHtml(scope.unitOfMeasure)}</td>`,
        `<td class="num">${f.hours}</td>`,
        `<td class="num">${f.actualRate.toFixed(2)}</td>`,
        `<td class="num">${f.budgetedRate.toFixed(2)}</td>`,
        `<td class="num">${statusPill(statusFor(f.factor), f.factor.toFixed(2))}</td>`,
        "</tr>",
      ].join("");
    })
    .join("");

  return [
    '<div class="panel scroll"><table><thead><tr>',
    "<th>Scope item</th><th>Date</th>",
    '<th class="num">Installed</th><th class="num">Hours</th>',
    '<th class="num">Actual /hr</th><th class="num">Bid /hr</th>',
    '<th class="num">Factor</th>',
    `</tr></thead><tbody>${rows}</tbody></table></div>`,
  ].join("");
}

export function overview(m: ViewModel): string {
  const worst = m.factors.reduce<ProductivityFactor | null>(
    (acc, f) => (acc === null || f.factor < acc.factor ? f : acc),
    null,
  );
  const critical = m.alerts.filter((a) => a.severity === "critical").length;
  const heldBack = m.hours.filter((h) => h.normalizationFlags.length > 0).length;

  const tiles: StatTile[] = [
    {
      label: "Scope items tracked",
      value: String(m.scopeItems.length),
      note: `${m.factors.length} reconciled to a factor`,
    },
    {
      label: "Lowest factor",
      value: worst ? worst.factor.toFixed(2) : "—",
      note: worst ? `on ${worst.date}` : "nothing reconciled",
      ...(worst ? { status: statusFor(worst.factor) } : {}),
    },
    {
      label: "Open alerts",
      value: String(m.alerts.length),
      note: `${critical} critical`,
      ...(m.alerts.length > 0 ? { status: "critical" as const } : {}),
    },
    {
      label: "Records held back",
      value: String(heldBack + m.estimates.filter((e) => e.abstained).length),
      note: `${heldBack} unmapped, ${m.estimates.filter((e) => e.abstained).length} abstained`,
    },
  ];

  const body = [
    statTiles(tiles),
    "<h2>Productivity against bid rate</h2>",
    factorChart(bars(m)),
    "<h2>Needs attention</h2>",
    alertCards(m),
  ].join("");

  return page({
    title: `SiteWireAi — ${m.project.name}`,
    path: "/",
    heading: m.project.name,
    lede: `${m.project.address} · ${m.project.province}. Quantity, labour hours and bid rate reconciled into a productivity factor per scope item.`,
    projectName: m.project.name,
    dataRegion: m.project.dataRegion,
    body,
    footer: footerFor(m),
  });
}

export function productivity(m: ViewModel): string {
  const body = [
    factorChart(bars(m)),
    "<h2>Reconciled factors</h2>",
    factorTable(m),
    '<p class="muted">Factor is actual install rate ÷ bid rate. Below 1.00 is slower than bid. A scope item with hours but no measurable quantity produces no row at all — a gap is shown as a gap, never as a zero.</p>',
  ].join("");

  return page({
    title: `Productivity — ${m.project.name}`,
    path: "/productivity",
    heading: "Productivity",
    lede: "Every reconciled factor, with the quantity and hours it was derived from.",
    projectName: m.project.name,
    dataRegion: m.project.dataRegion,
    body,
    footer: footerFor(m),
  });
}

export function alerts(m: ViewModel): string {
  return page({
    title: `Alerts — ${m.project.name}`,
    path: "/alerts",
    heading: "Alerts",
    lede: "Drift below bid rate, with the jobsite conditions found on the same captures. The conditions are what turn a number into a claim a PM can act on and an adjudicator can read.",
    projectName: m.project.name,
    dataRegion: m.project.dataRegion,
    body: alertCards(m),
    footer: footerFor(m),
  });
}

export function dataQuality(m: ViewModel): string {
  const flagged = m.hours.filter((h) => h.normalizationFlags.length > 0);
  const abstained = m.estimates.filter((e) => e.abstained);

  const items: string[] = [];
  if (flagged.length) {
    items.push(
      `<li><strong>${flagged.length} labour-hours record(s) held back from the join</strong> — ${flagged
        .map((h) => escapeHtml(h.normalizationFlags.join(", ")))
        .join(
          "; ",
        )}. Surfaced rather than joined, so a bad cost code cannot silently become a productivity factor.</li>`,
    );
  }
  if (abstained.length) {
    items.push(
      `<li><strong>${abstained.length} estimate(s) abstained</strong> — the model declined to guess rather than return a low-confidence number. An abstention is absent from the maths, not counted as zero installed quantity.</li>`,
    );
  }

  const body = [
    '<div class="note">',
    items.length ? `<ul>${items.join("")}</ul>` : '<span class="muted">Nothing held back.</span>',
    "</div>",
    "<h2>What this dashboard will not show</h2>",
    '<div class="note"><ul>',
    "<li><strong>No individual-worker productivity view.</strong> Captures carry a <code>captured_by</code> field for provenance, and nothing groups by it. There is no table, column, or derived view that aggregates installed quantity per worker — the constraint sits in the schema, not just in the UI.</li>",
    "<li><strong>No accuracy claim from invented data.</strong> Accuracy is reported only against a held-out set of field and self-measured captures. Every capture here is simulated, so none of them may measure a model.</li>",
    "</ul></div>",
  ].join("");

  return page({
    title: `Data quality — ${m.project.name}`,
    path: "/data-quality",
    heading: "Data quality",
    lede: "What was deliberately excluded from the numbers, and why.",
    projectName: m.project.name,
    dataRegion: m.project.dataRegion,
    body,
    footer: footerFor(m),
  });
}
