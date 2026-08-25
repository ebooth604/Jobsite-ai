/**
 * Customer landing page: pick a project, then pick a report for the audience it
 * is going to.
 *
 * The audience grouping is the point. The same underlying record goes to three
 * very different readers — counsel, an adjudicator, and a CEO — and what each
 * needs from it is not the same document with a different logo.
 */

import { DEMO_CAPTURE, tally } from "./demo-capture.js";
import { markupSvg } from "./demo-capture-view.js";
import {
  AUDIENCE_LABEL,
  type Audience,
  type ProjectData,
  REPORT_KINDS,
  type ReportKind,
  readiness,
  traceFactors,
} from "./reports.js";
import { escapeHtml, page, statusFor, statusPill } from "./ui.js";

const LANDING_STYLES = `
  .proj-grid { display: grid; gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .proj { background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 16px; display: flex; flex-direction: column;
    gap: 6px; }
  .proj.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .proj h3 { margin: 0; font-size: 16px; }
  .proj-stats { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 6px;
    font-size: 13px; color: var(--ink-2); }
  .proj a.choose { margin-top: 10px; align-self: flex-start; text-decoration: none;
    padding: 7px 13px; border: 1px solid var(--accent); border-radius: 6px;
    color: var(--accent); font-size: 14px; font-weight: 600; }
  .proj a.choose:hover { background: var(--accent); color: #fff; }

  .site-nav { display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
  .site-nav a { display: block; text-decoration: none; color: inherit;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 14px 16px; }
  .site-nav a:hover { border-color: var(--accent); }
  .site-nav strong { display: block; font-size: 15px; margin-bottom: 3px; }
  .site-nav span { font-size: 13px; color: var(--ink-2); }

  .aud { margin-top: 26px; }
  .aud h2 { margin-bottom: 8px; }
  .rep-grid { display: grid; gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  .rep { background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 16px; display: flex; flex-direction: column; }
  .rep h3 { margin: 0 0 6px; font-size: 15px; }
  .rep p { margin: 0 0 10px; font-size: 14px; color: var(--ink-2); }
  .rep .caveat { border-left: 3px solid var(--warning); padding: 8px 10px;
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    border-radius: 0 6px 6px 0; font-size: 13px; color: var(--ink); }
  .rep .foot { margin-top: auto; padding-top: 12px; display: flex;
    align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .rep a.gen { text-decoration: none; padding: 7px 13px; border-radius: 6px;
    border: 1px solid var(--accent); background: var(--accent); color: #fff;
    font-size: 14px; font-weight: 600; }
  .rep a.gen.blocked { background: transparent; color: var(--muted);
    border-color: var(--line); pointer-events: none; }
  .ready { font-size: 12px; }
  .ready.ok { color: var(--good); }
  .ready.no { color: var(--critical); }
`;

function projectCard(data: ProjectData, selectedId: string): string {
  const worst = data.factors.reduce<number | null>(
    (acc, f) => (acc === null || f.factor < acc ? f.factor : acc),
    null,
  );
  const selected = data.project.id === selectedId ? " selected" : "";

  const stats =
    data.factors.length > 0
      ? `<span>${data.scopeItems.length} scope items</span>
         <span>${data.factors.length} reconciled</span>
         <span>${data.captures.length} captures</span>`
      : `<span>${data.scopeItems.length} scope items</span>
         <span class="muted">Awaiting first capture</span>`;

  return `<div class="proj${selected}">
    <h3>${escapeHtml(data.project.name)}</h3>
    <div class="muted">${escapeHtml(data.project.address)} · ${escapeHtml(data.project.province)}</div>
    <div class="proj-stats">${stats}</div>
    ${worst !== null ? `<div>Lowest factor ${statusPill(statusFor(worst), worst.toFixed(2))}</div>` : ""}
    <a class="choose" href="/projects?project=${encodeURIComponent(data.project.id)}">
      ${selected ? "Selected" : "Select project"}
    </a>
  </div>`;
}

function reportCard(kind: ReportKind, data: ProjectData): string {
  const state = readiness(data, kind);
  const href = `/projects/report?project=${encodeURIComponent(data.project.id)}&kind=${encodeURIComponent(kind.id)}`;

  return `<div class="rep">
    <h3>${escapeHtml(kind.title)}</h3>
    <p>${escapeHtml(kind.blurb)}</p>
    ${kind.caveat ? `<div class="caveat"><strong>Provisional.</strong> ${escapeHtml(kind.caveat)}</div>` : ""}
    <div class="foot">
      <span class="ready ${state.ready ? "ok" : "no"}">${escapeHtml(state.reason)}</span>
      <a class="gen${state.ready ? "" : " blocked"}" href="${state.ready ? href : "#"}">
        ${state.ready ? "Generate" : "Not ready"}
      </a>
    </div>
  </div>`;
}

/**
 * Where everything else lives. The dashboard is the first thing in the nav and
 * the page a customer lands on, so it has to answer "what else is in here" — a
 * top nav bar alone makes someone guess what "Bid alignment" means before
 * clicking it.
 */
const SITE_SECTIONS: { href: string; title: string; blurb: string }[] = [
  {
    href: "/",
    title: "Overview",
    blurb: "Headline numbers for the selected project — factors, alerts, held-back records.",
  },
  {
    href: "/productivity",
    title: "Productivity",
    blurb: "Every reconciled factor with the quantity and hours behind it.",
  },
  {
    href: "/alerts",
    title: "Alerts",
    blurb: "Scope items drifting below bid rate, with the conditions found on the same captures.",
  },
  {
    href: "/capture",
    title: "Capture",
    blurb: "Upload photos, redact faces before anything is stored, and set capture parameters.",
  },
  {
    href: "/bid",
    title: "Bid alignment",
    blurb: "Upload a bid, derive the budgeted rate, and map labour cost codes onto it.",
  },
  {
    href: "/data-quality",
    title: "Data quality",
    blurb: "What was deliberately excluded from the numbers, and why.",
  },
];

function siteNav(): string {
  const cards = SITE_SECTIONS.map(
    (s) =>
      `<a href="${s.href}"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.blurb)}</span></a>`,
  ).join("");
  return `<div class="site-nav">${cards}</div>`;
}

export function landingView(all: ProjectData[], selectedId: string): string {
  const selected = all.find((d) => d.project.id === selectedId) ?? all[0];
  if (!selected) throw new Error("no projects");

  const cards = all.map((d) => projectCard(d, selected.project.id)).join("");

  const audiences: Audience[] = ["court", "arbitration", "executive"];
  const sections = audiences
    .map((audience) => {
      const kinds = REPORT_KINDS.filter((k) => k.audience === audience);
      return `<section class="aud">
        <h2>${escapeHtml(AUDIENCE_LABEL[audience])}</h2>
        <div class="rep-grid">${kinds.map((k) => reportCard(k, selected)).join("")}</div>
      </section>`;
    })
    .join("");

  const body = `
<style>${LANDING_STYLES}</style>

<h2>Projects</h2>
<div class="proj-grid">${cards}</div>

<div class="note" style="margin-top:26px">
  <strong>These are exports, not filings.</strong> A package is something a
  subcontractor or their counsel sends. SiteWireAi does not file to ODACC or to a BC
  nominating authority, and nothing here submits anything on your behalf.
</div>

<h2 style="margin-top:10px">Reports for ${escapeHtml(selected.project.name)}</h2>
${sections}

<h2 style="margin-top:32px">Everywhere else in SiteWireAi</h2>
${siteNav()}
`;

  return page({
    title: `Dashboard — ${selected.project.name}`,
    path: "/projects",
    heading: "Dashboard",
    lede: "Choose a project, then the report for whoever is going to read it. A report only becomes available once every figure in it resolves back to a source capture and labour-hours record.",
    projectName: selected.project.name,
    dataRegion: selected.project.dataRegion,
    body,
    footer: `${all.length} projects · reports are exports, never filings`,
  });
}

const REPORT_STYLES = `
  .doc { background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 24px; }
  .doc h2 { margin-top: 24px; }
  .doc h2:first-child { margin-top: 0; }
  .prov { font-size: 12px; color: var(--muted); }
  .trace-list { margin: 4px 0 0; padding-left: 16px; font-size: 12px;
    color: var(--muted); }
  .stamp { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px;
    font-size: 13px; margin-bottom: 16px; }
  .stamp.ok { border-color: var(--good);
    background: color-mix(in srgb, var(--good) 8%, transparent); }
  .back { display: inline-block; margin-bottom: 14px; font-size: 14px;
    color: var(--accent); text-decoration: none; }
`;

export function reportView(data: ProjectData, kind: ReportKind): string {
  const rows = traceFactors(data);
  const state = readiness(data, kind);
  const held = data.hours.filter((h) => h.normalizationFlags.length > 0);
  const abstained = data.estimates.filter((e) => e.abstained);

  const figureRows = rows
    .map(
      (r) => `<tr>
        <td><strong>${escapeHtml(r.scopeItem.trade)}</strong><br>
          <span class="muted">${escapeHtml(r.scopeItem.description)}</span></td>
        <td>${escapeHtml(r.factor.date)}</td>
        <td class="num">${r.factor.installedQuantity} ${escapeHtml(r.scopeItem.unitOfMeasure)}</td>
        <td class="num">${r.factor.hours}</td>
        <td class="num">${statusPill(statusFor(r.factor.factor), r.factor.factor.toFixed(2))}</td>
        <td class="prov">
          ${r.traced ? "Traced" : "<strong>Untraced</strong>"}
          <ul class="trace-list">
            <li>captures: ${r.captureIds.map(escapeHtml).join(", ") || "none"}</li>
            <li>hours: ${r.hoursIds.map(escapeHtml).join(", ") || "none"}</li>
          </ul>
        </td>
      </tr>`,
    )
    .join("");

  const conditions = data.conditions.length
    ? `<ul>${data.conditions
        .map(
          (c) =>
            `<li>${escapeHtml(c.description)} <span class="muted">(${escapeHtml(c.conditionType)}, capture ${escapeHtml(c.captureId)}, confidence ${c.confidence.toFixed(2)})</span></li>`,
        )
        .join("")}</ul>`
    : '<p class="muted">No conditions recorded for this period.</p>';

  const exclusions: string[] = [];
  if (held.length) {
    exclusions.push(
      `${held.length} labour-hours record(s) excluded — ${held.map((h) => escapeHtml(h.normalizationFlags.join(", "))).join("; ")}. Excluded rather than joined, so no figure above rests on an unmapped cost code.`,
    );
  }
  if (abstained.length) {
    exclusions.push(
      `${abstained.length} quantity estimate(s) abstained — the model declined to give a number. Recorded as absent, never as zero.`,
    );
  }

  const body = `
<style>${REPORT_STYLES}</style>
<a class="back" href="/projects?project=${encodeURIComponent(data.project.id)}">← Back to reports</a>

<div class="stamp ${state.ready ? "ok" : ""}">
  <strong>Traceability:</strong> ${escapeHtml(state.reason)}
</div>

${
  kind.caveat
    ? `<div class="banner"><strong>Provisional format.</strong> ${escapeHtml(kind.caveat)}</div>`
    : ""
}

<div class="doc">
  <h2>${escapeHtml(kind.title)}</h2>
  <p class="muted">
    ${escapeHtml(data.project.name)} · ${escapeHtml(data.project.address)},
    ${escapeHtml(data.project.province)} · data region ${escapeHtml(data.project.dataRegion)}
  </p>

  <h2>Figures and their sources</h2>
  <div class="scroll"><table>
    <thead><tr><th>Scope item</th><th>Date</th><th class="num">Installed</th>
    <th class="num">Hours</th><th class="num">Factor</th><th>Provenance</th></tr></thead>
    <tbody>${figureRows}</tbody>
  </table></div>

  <h2>Conditions recorded on the same captures</h2>
  ${conditions}

  ${captureExhibit(data)}

  <h2>Deliberately excluded</h2>
  ${
    exclusions.length
      ? `<ul>${exclusions.map((e) => `<li>${e}</li>`).join("")}</ul>`
      : '<p class="muted">Nothing excluded for this period.</p>'
  }

  <h2>Standing notes</h2>
  <ul>
    <li>Every capture in this demo is <code>origin: "simulated"</code>. No figure here describes real work.</li>
    <li>No individual-worker productivity view exists in the schema, so none can appear in a report.</li>
    <li>This document is an export for the subcontractor or their counsel. It is not a filing, and nothing was submitted to any authority.</li>
  </ul>
</div>
`;

  return page({
    title: `${kind.title} — ${data.project.name}`,
    path: "/projects",
    heading: kind.title,
    lede: `${data.project.name} · prepared for ${AUDIENCE_LABEL[kind.audience].toLowerCase()}.`,
    projectName: data.project.name,
    dataRegion: data.project.dataRegion,
    body,
    footer: "SiteWireAi demo · export only · not a filing",
  });
}

/**
 * Optional photographic exhibit.
 *
 * Only offered in dev, and only on the project the demo capture belongs to. A
 * client who wants the photograph in their package gets it with the annotation
 * layer intact and its simulated origin stated on the exhibit itself — a
 * photograph in an evidence package is the most persuasive thing in it, which is
 * exactly why it must carry its provenance rather than sit there looking like
 * proof.
 */
function captureExhibit(data: ProjectData): string {
  if (process.env.SITEWIREAI_MODE !== "dev") return "";
  if (data.project.id !== DEMO_CAPTURE.projectId) return "";

  const t = tally();
  return `
  <h2>Exhibit A — annotated capture</h2>
  <div class="banner">
    <strong>Real photograph, invented numbers.</strong> This capture is
    <code>origin: "simulated"</code>. It illustrates what the annotation layer
    produces; no figure on it describes measured work, and none of it may support
    an accuracy claim.
  </div>
  <div style="position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;max-width:640px">
    <img src="${escapeHtml(DEMO_CAPTURE.imagePath)}" alt="Annotated capture, ${escapeHtml(DEMO_CAPTURE.area)}" style="display:block;width:100%;height:auto">
    <div style="position:absolute;inset:0">${markupSvg(DEMO_CAPTURE)}</div>
  </div>
  <p class="muted" style="font-size:13px">
    ${escapeHtml(DEMO_CAPTURE.area)} · ${escapeHtml(DEMO_CAPTURE.capturedAt)} ·
    ${t.counted} board counted, ${t.belowThreshold} below threshold ·
    model ${escapeHtml(DEMO_CAPTURE.modelVersion)} ·
    face blur ${escapeHtml(DEMO_CAPTURE.faceBlurStatus)}
  </p>`;
}
