/**
 * The admin console: every tenant, and the things worth editing about them.
 *
 * This is the one surface that deliberately crosses tenant boundaries, so the
 * gate in front of it is the whole of its security. `requireAdmin` in
 * `admin-routes.ts` is that gate; nothing here re-checks, and nothing here
 * should be reachable without passing it.
 *
 * What it edits is chosen rather than exhaustive. Organizations, projects,
 * scope items and labour hours are configuration — someone sets them up and
 * corrects them. Captures, estimates and conditions are *records of what
 * happened*, so they can be viewed and deleted but not hand-edited: an
 * estimate you can type over is no longer evidence of anything.
 */

import * as db from "@sitewireai/db";
import { escapeHtml } from "./ui.js";

const STYLES = `
  :root { --bg:#f9f9f7; --panel:#fff; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
    --line:#e1e0d9; --good:#0ca30c; --warning:#fab219; --critical:#d03b3b; --accent:#2a78d6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d0d0d; --panel:#1c2024; --ink:#fff;
    --ink-2:#c3c2b7; --line:#2b3242; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  a { color:var(--accent); }
  .top { border-bottom:1px solid var(--line); background:var(--panel); padding:12px 24px;
    display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .brand { font-weight:700; }
  .brand span { font-weight:400; color:var(--muted); margin-left:10px; }
  .who { margin-left:auto; font-size:13px; color:var(--muted); }
  .wrap { max-width:1100px; margin:0 auto; padding:24px; }
  h1 { font-size:24px; margin:0 0 4px; }
  h2 { font-size:17px; margin:26px 0 10px; }
  .lede { color:var(--ink-2); margin:0 0 18px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:10px;
    padding:16px; margin-bottom:16px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { text-align:left; padding:9px 10px; border-bottom:1px solid var(--line);
    vertical-align:top; }
  th { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  td.num,th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .muted { color:var(--muted); }
  .chip { display:inline-block; padding:2px 9px; border-radius:999px; border:1px solid var(--line);
    font-size:11px; color:var(--ink-2); white-space:nowrap; }
  .chip.warn { border-color:var(--warning); color:var(--warning); }
  .row { display:grid; gap:10px; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
  label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.06em;
    color:var(--muted); margin-bottom:4px; }
  input,select { width:100%; padding:8px 10px; font:inherit; font-size:14px; color:var(--ink);
    background:var(--bg); border:1px solid var(--line); border-radius:6px; }
  .btn { display:inline-block; padding:8px 14px; border:1px solid var(--line); border-radius:6px;
    background:var(--bg); color:var(--ink); cursor:pointer; font:inherit; font-size:14px;
    text-decoration:none; }
  .btn.primary { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; }
  .btn.danger { color:var(--critical); border-color:var(--critical); }
  .note { border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:8px;
    padding:12px 14px; font-size:14px; color:var(--ink-2); margin-bottom:14px; }
  .note.bad { border-left-color:var(--critical); }
  .empty { color:var(--muted); border:1px dashed var(--line); border-radius:8px; padding:20px;
    text-align:center; }
  form.inline { display:inline; }
`;

function shell(title: string, email: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — SiteWireAi admin</title><style>${STYLES}</style></head><body>
<div class="top">
  <div class="brand">SiteWireAi<span>admin</span></div>
  <a href="/admin">All organizations</a>
  <a href="/">Client view</a>
  <div class="who">${escapeHtml(email)} · <a href="/logout">Sign out</a></div>
</div>
<div class="wrap">${body}</div></body></html>`;
}

/** Flash message carried through a redirect, so a write reports its own result. */
function flash(message: string, bad = false): string {
  if (!message) return "";
  return `<div class="note${bad ? " bad" : ""}">${escapeHtml(message)}</div>`;
}

export interface OrgSummary {
  org: db.OrgRow;
  projects: number;
  scopeItems: number;
  captures: number;
  hours: number;
}

export function overviewView(summaries: OrgSummary[], email: string, message: string): string {
  const rows = summaries
    .map(
      (s) => `<tr>
  <td><a href="/admin/org/${escapeHtml(s.org.id)}"><strong>${escapeHtml(s.org.name)}</strong></a>
    <div class="muted">${escapeHtml(s.org.slug)}</div></td>
  <td class="num">${s.projects}</td>
  <td class="num">${s.scopeItems}</td>
  <td class="num">${s.captures}</td>
  <td class="num">${s.hours}</td>
</tr>`,
    )
    .join("");

  const body = `
<h1>Organizations</h1>
<p class="lede">Every tenant on this deployment. This is the one surface that crosses
organization boundaries — everything else in the product is scoped to a single one.</p>
${flash(message)}

${
  summaries.length === 0
    ? '<div class="empty">No organizations yet. Create the first one below.</div>'
    : `<div class="panel"><table>
  <thead><tr><th>Organization</th><th class="num">Projects</th><th class="num">Scope items</th>
    <th class="num">Captures</th><th class="num">Hours records</th></tr></thead>
  <tbody>${rows}</tbody></table></div>`
}

<div class="panel">
  <h2 style="margin-top:0">New organization</h2>
  <form method="post" action="/admin/org/create">
    <div class="row">
      <div><label for="name">Name</label>
        <input id="name" name="name" required placeholder="Northpoint Construction"></div>
      <div><label for="slug">Slug</label>
        <input id="slug" name="slug" required placeholder="northpoint"
          pattern="[a-z0-9-]+" title="Lower case letters, digits and hyphens only"></div>
    </div>
    <p class="muted" style="font-size:13px;margin:8px 0 12px">
      The slug identifies the tenant in URLs and in the <code>custom:orgId</code> binding on
      each user. It cannot be changed later without moving every user across.
    </p>
    <button type="submit" class="btn primary">Create organization</button>
  </form>
</div>`;

  return shell("Organizations", email, body);
}

export interface OrgDetail {
  org: db.OrgRow;
  projects: db.ProjectRow[];
  scopeItems: db.ScopeItemRow[];
  captures: db.CaptureRow[];
  hours: db.HoursRow[];
  estimates: db.EstimateRow[];
}

export function orgView(detail: OrgDetail, email: string, message: string, bad: boolean): string {
  const { org } = detail;
  const projectName = (id: string) =>
    detail.projects.find((p) => p.id === id)?.name ?? "(no project)";

  const projectRows = detail.projects
    .map((p) => {
      const scope = detail.scopeItems.filter((s) => s.projectId === p.id).length;
      const caps = detail.captures.filter((c) => c.projectId === p.id).length;
      return `<tr>
  <td><strong>${escapeHtml(p.name)}</strong>
    <div class="muted">${escapeHtml(p.address)} · ${escapeHtml(p.province)}</div>
    <div class="muted"><code>${escapeHtml(p.id)}</code></div></td>
  <td class="num">${scope}</td>
  <td class="num">${caps}</td>
  <td>
    <form class="inline" method="post" action="/admin/project/delete"
      onsubmit="return confirm('Delete ${escapeHtml(p.name).replace(/'/g, "\\'")} and all its scope items, captures and hours? This cannot be undone.')">
      <input type="hidden" name="orgId" value="${escapeHtml(org.id)}">
      <input type="hidden" name="projectId" value="${escapeHtml(p.id)}">
      <button type="submit" class="btn danger">Delete</button>
    </form>
  </td>
</tr>`;
    })
    .join("");

  const scopeRows = detail.scopeItems
    .map(
      (s) => `<tr>
  <td><strong>${escapeHtml(s.trade)}</strong>
    <div class="muted">${escapeHtml(s.description)}</div>
    <div class="muted"><code>${escapeHtml(s.id)}</code></div></td>
  <td class="muted">${escapeHtml(projectName(s.projectId))}</td>
  <td class="num">${s.bidQuantity} ${escapeHtml(s.unitOfMeasure)}</td>
  <td class="num">${s.budgetedUnitsPerHour}/hr</td>
  <td>
    <form class="inline" method="post" action="/admin/scope/delete"
      onsubmit="return confirm('Delete this scope item? Estimates and hours pointing at it will be orphaned.')">
      <input type="hidden" name="orgId" value="${escapeHtml(org.id)}">
      <input type="hidden" name="scopeItemId" value="${escapeHtml(s.id)}">
      <button type="submit" class="btn danger">Delete</button>
    </form>
  </td>
</tr>`,
    )
    .join("");

  const hoursRows = detail.hours
    .map((h) => {
      const flags = h.normalizationFlags ?? [];
      return `<tr>
  <td>${escapeHtml(h.date)}</td>
  <td class="muted">${escapeHtml(projectName(h.projectId))}</td>
  <td class="muted">${h.scopeItemId ? escapeHtml(h.scopeItemId) : '<span class="chip warn">unmapped</span>'}</td>
  <td class="num">${h.hours}</td>
  <td class="muted">${escapeHtml(h.sourceSystem)}
    ${flags.map((f) => `<span class="chip warn">${escapeHtml(f)}</span>`).join(" ")}</td>
</tr>`;
    })
    .join("");

  const captureRows = detail.captures
    .slice(0, 40)
    .map((c) => {
      const est = detail.estimates.find((e) => e.captureId === c.id);
      const quantity = !est
        ? '<span class="muted">—</span>'
        : est.abstained
          ? '<span class="chip warn">abstained</span>'
          : String(est.estimatedQuantity ?? "—");
      return `<tr>
  <td><code>${escapeHtml(c.id.slice(0, 22))}</code>
    <div class="muted">${escapeHtml(c.area)}</div></td>
  <td class="muted">${escapeHtml(projectName(c.projectId))}</td>
  <td class="muted">${escapeHtml(c.capturedAt)}</td>
  <td><span class="chip">${escapeHtml(c.origin)}</span>
    ${c.imageKey ? '<span class="chip">image</span>' : ""}</td>
  <td class="num">${quantity}</td>
  <td>
    <form class="inline" method="post" action="/admin/capture/delete"
      onsubmit="return confirm('Delete this capture? The photograph is removed too.')">
      <input type="hidden" name="orgId" value="${escapeHtml(org.id)}">
      <input type="hidden" name="captureId" value="${escapeHtml(c.id)}">
      <button type="submit" class="btn danger">Delete</button>
    </form>
  </td>
</tr>`;
    })
    .join("");

  const projectOptions = detail.projects
    .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
    .join("");
  const scopeOptions = detail.scopeItems
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}">${escapeHtml(s.trade)} — ${escapeHtml(s.description)}</option>`,
    )
    .join("");

  const body = `
<h1>${escapeHtml(org.name)}</h1>
<p class="lede"><code>${escapeHtml(org.slug)}</code> · <code>${escapeHtml(org.id)}</code></p>
${flash(message, bad)}

<h2>Projects</h2>
${
  detail.projects.length === 0
    ? '<div class="empty">No projects yet.</div>'
    : `<div class="panel"><table>
  <thead><tr><th>Project</th><th class="num">Scope</th><th class="num">Captures</th><th></th></tr></thead>
  <tbody>${projectRows}</tbody></table></div>`
}

<div class="panel">
  <h2 style="margin-top:0">Add a project</h2>
  <form method="post" action="/admin/project/create">
    <input type="hidden" name="orgId" value="${escapeHtml(org.id)}">
    <div class="row">
      <div><label for="pname">Name</label><input id="pname" name="name" required></div>
      <div><label for="paddr">Address</label><input id="paddr" name="address"></div>
      <div><label for="pprov">Province</label><input id="pprov" name="province" maxlength="2"
        placeholder="BC"></div>
    </div>
    <div style="margin-top:12px"><button type="submit" class="btn primary">Add project</button></div>
  </form>
</div>

<h2>Scope items</h2>
<p class="muted" style="font-size:13px;margin-top:-6px">The bid lines everything reconciles
against. A productivity factor is installed rate divided by the budgeted rate here, so these
numbers decide what "on rate" means.</p>
${
  detail.scopeItems.length === 0
    ? '<div class="empty">No scope items yet.</div>'
    : `<div class="panel"><table>
  <thead><tr><th>Scope item</th><th>Project</th><th class="num">Bid</th>
    <th class="num">Budget rate</th><th></th></tr></thead>
  <tbody>${scopeRows}</tbody></table></div>`
}

${
  detail.projects.length === 0
    ? ""
    : `<div class="panel">
  <h2 style="margin-top:0">Add a scope item</h2>
  <form method="post" action="/admin/scope/create">
    <input type="hidden" name="orgId" value="${escapeHtml(org.id)}">
    <div class="row">
      <div><label for="sproj">Project</label>
        <select id="sproj" name="projectId" required>${projectOptions}</select></div>
      <div><label for="strade">Trade</label><input id="strade" name="trade" required
        placeholder="Drywall"></div>
      <div><label for="sdesc">Description</label><input id="sdesc" name="description" required
        placeholder="Level 5 board hang"></div>
    </div>
    <div class="row" style="margin-top:10px">
      <div><label for="sunit">Unit</label><input id="sunit" name="unitOfMeasure" required
        placeholder="sheets"></div>
      <div><label for="sbid">Bid quantity</label><input id="sbid" name="bidQuantity" type="number"
        step="any" min="0" required></div>
      <div><label for="srate">Budgeted units/hour</label><input id="srate"
        name="budgetedUnitsPerHour" type="number" step="any" min="0" required></div>
    </div>
    <div style="margin-top:12px"><button type="submit" class="btn primary">Add scope item</button></div>
  </form>
</div>`
}

<h2>Labour hours</h2>
<p class="muted" style="font-size:13px;margin-top:-6px">Entered by hand until the timekeeping
integrations land. A record with no scope item is held back from every factor rather than
guessed at — that is deliberate, and the data-quality page reports it.</p>
${
  detail.hours.length === 0
    ? '<div class="empty">No labour hours recorded.</div>'
    : `<div class="panel"><table>
  <thead><tr><th>Date</th><th>Project</th><th>Scope item</th><th class="num">Hours</th>
    <th>Source</th></tr></thead>
  <tbody>${hoursRows}</tbody></table></div>`
}

${
  detail.projects.length === 0
    ? ""
    : `<div class="panel">
  <h2 style="margin-top:0">Record labour hours</h2>
  <form method="post" action="/admin/hours/create">
    <input type="hidden" name="orgId" value="${escapeHtml(org.id)}">
    <div class="row">
      <div><label for="hproj">Project</label>
        <select id="hproj" name="projectId" required>${projectOptions}</select></div>
      <div><label for="hscope">Scope item</label>
        <select id="hscope" name="scopeItemId">
          <option value="">— unmapped, hold back —</option>${scopeOptions}</select></div>
      <div><label for="hdate">Date</label><input id="hdate" name="date" type="date" required></div>
      <div><label for="hhours">Hours</label><input id="hhours" name="hours" type="number"
        step="any" min="0" required></div>
      <div><label for="hsrc">Source system</label><input id="hsrc" name="sourceSystem"
        placeholder="Procore"></div>
    </div>
    <div style="margin-top:12px"><button type="submit" class="btn primary">Record hours</button></div>
  </form>
</div>`
}

<h2>Captures</h2>
<p class="muted" style="font-size:13px;margin-top:-6px">Records of what was seen, so they can be
viewed and deleted but not edited. An estimate you can type over stops being evidence.
${detail.captures.length > 40 ? ` Showing the 40 most recent of ${detail.captures.length}.` : ""}</p>
${
  detail.captures.length === 0
    ? '<div class="empty">No captures.</div>'
    : `<div class="panel"><table>
  <thead><tr><th>Capture</th><th>Project</th><th>Taken</th><th>Origin</th>
    <th class="num">Quantity</th><th></th></tr></thead>
  <tbody>${captureRows}</tbody></table></div>`
}`;

  return shell(org.name, email, body);
}

export function deniedView(email: string): string {
  return shell(
    "Not permitted",
    email,
    `<h1>Not permitted</h1>
<p class="lede">This area is for administrators. Your account is signed in but is not in the
admin group.</p>
<p><a href="/">Back to the dashboard</a></p>`,
  );
}
