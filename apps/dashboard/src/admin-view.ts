/**
 * Client onboarding form — LOCAL ONLY.
 *
 * This view is routed exclusively from local-server.ts and is deliberately absent
 * from handler.ts, so the deployed Lambda has no path to it. That is a structural
 * exclusion rather than a flag someone can flip by mistake.
 *
 * Two things this form deliberately does NOT collect:
 *
 *   - Integration credentials. Procore, Jonas, Vista and Rhumbix connect by OAuth
 *     at setup time; an API key typed into an onboarding form ends up in a browser
 *     history, a screenshot, and eventually a support ticket. The form records
 *     *which* systems a customer uses so the connection can be initiated properly.
 *   - Anything about individual workers. The schema has no per-worker productivity
 *     view by design (business plan §4.3), so onboarding must not start collecting
 *     the data that would make one possible.
 */

import { ADMIN_EMAIL, CONTACT_EMAIL } from "./emails.js";
import { escapeHtml, page } from "./ui.js";

const ADMIN_STYLES = `
  .admin-warn { border: 1px solid var(--critical); border-left-width: 4px;
    background: color-mix(in srgb, var(--critical) 10%, transparent);
    padding: 12px 14px; border-radius: 6px; margin-bottom: 18px; font-size: 14px; }
  fieldset { border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px 18px;
    margin: 0 0 16px; background: var(--panel); }
  legend { padding: 0 8px; font-size: 12px; text-transform: uppercase;
    letter-spacing: .08em; color: var(--muted); font-weight: 600; }
  .grid2 { display: grid; gap: 12px 16px;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .f { display: flex; flex-direction: column; gap: 4px; }
  .f label { font-size: 12px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); }
  .f input, .f select, .f textarea { padding: 8px 10px; font: inherit; font-size: 14px;
    color: var(--ink); background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; width: 100%; }
  .f textarea { min-height: 64px; resize: vertical; }
  .hint { font-size: 12px; color: var(--muted); }
  .f.bad input, .f.bad select { border-color: var(--critical); }
  .f .err { font-size: 12px; color: var(--critical); }
  .checks { display: grid; gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  .checks label { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .actions button { padding: 10px 16px; border-radius: 6px; font: inherit;
    font-weight: 600; cursor: pointer; border: 1px solid var(--accent);
    background: var(--accent); color: #fff; }
  .actions button.secondary { background: transparent; color: var(--accent); }
  .actions a.button-link { display: inline-block; padding: 10px 16px; border-radius: 6px;
    font: inherit; font-weight: 600; text-decoration: none; border: 1px solid var(--accent);
    background: var(--accent); color: #fff; }
  #admin-out { margin-top: 16px; }
  #admin-out pre { background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 14px; overflow-x: auto; font-size: 12px; }
  #admin-summary { font-size: 14px; margin-bottom: 10px; }
  #admin-summary.ok { color: var(--good); }
  #admin-summary.bad { color: var(--critical); }
`;

const PROVINCES = ["BC", "AB", "SK", "MB", "ON", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"];
const TRADES = [
  "Electrical rough-in",
  "Concrete forming",
  "Drywall",
  "Framing",
  "Mechanical",
  "Other",
];
const PHOTO_SOURCES = ["Procore", "Autodesk Build", "Mobile app only"];
const HOURS_SOURCES = ["Procore", "Jonas", "Vista", "Rhumbix", "CSV upload", "None yet"];

const field = (
  id: string,
  label: string,
  input: string,
  hint?: string,
): string => `<div class="f" data-field="${id}">
  <label for="${id}">${escapeHtml(label)}</label>
  ${input}
  ${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ""}
  <span class="err" hidden></span>
</div>`;

const options = (values: string[]): string =>
  values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

const checkboxes = (name: string, values: string[]): string =>
  `<div class="checks">${values
    .map(
      (v) =>
        `<label><input type="checkbox" name="${name}" value="${escapeHtml(v)}"> ${escapeHtml(v)}</label>`,
    )
    .join("")}</div>`;

export function adminView(): string {
  const body = `
<style>${ADMIN_STYLES}</style>

<div class="admin-warn">
  <strong>Internal — local only.</strong> This page is routed from the local dev
  server and is not reachable on the deployed site. It has no authentication yet,
  so do not run this server on a shared network with real customer data in it.
</div>

<fieldset>
  <legend>Photo classification</legend>
  <p class="hint" style="margin:0 0 12px">
    Upload jobsite photos and have a frontier model classify them — trade, scope,
    conditions and a recommendation. It runs as its own local app — start it with
    <code>pnpm --filter @sitewireai/trainer serve</code> — and is not part of the
    deployed site, same as this page.
  </p>
  <p class="hint" style="margin:0 0 12px; color: var(--critical)">
    <strong>Does not follow the residency or face-blur rules described below.</strong>
    Photos are stored on the local disk exactly as uploaded, with no redaction, and
    classification sends them to the Anthropic API outside Canada. Do not put
    customer photographs through it under a contract that promises either.
  </p>
  <div class="actions">
    <a class="button-link" href="http://localhost:4180" target="_blank" rel="noopener">
      Open classification →
    </a>
  </div>
</fieldset>

<form id="onboard" novalidate>

  <fieldset>
    <legend>Organization</legend>
    <div class="grid2">
      ${field("legalName", "Legal name *", '<input id="legalName" required>', "As it appears on the contract")}
      ${field("tradeName", "Operating name", '<input id="tradeName">', "If different from legal name")}
      ${field("province", "Province *", `<select id="province">${options(PROVINCES)}</select>`)}
      ${field("dataRegion", "Data region", '<input id="dataRegion" value="ca-central-1" readonly>', "Canadian region is contractual — not selectable")}
      ${field("orgSize", "Field headcount", '<input id="orgSize" type="number" min="1" step="1">', "Approximate, for sizing not billing")}
      ${field("startDate", "Contract start *", '<input id="startDate" type="date">')}
    </div>
  </fieldset>

  <fieldset>
    <legend>Primary contact</legend>
    <div class="grid2">
      ${field("contactName", "Name *", '<input id="contactName">')}
      ${field("contactRole", "Role", '<input id="contactRole" placeholder="PM, VP Ops, Chief Estimator">')}
      ${field("contactEmail", "Email *", '<input id="contactEmail" type="email">')}
      ${field("contactPhone", "Phone", '<input id="contactPhone" type="tel">')}
    </div>
  </fieldset>

  <fieldset>
    <legend>First project</legend>
    <div class="grid2">
      ${field("projectName", "Project name *", '<input id="projectName">')}
      ${field("projectAddress", "Address *", '<input id="projectAddress">')}
      ${field("projectProvince", "Province", `<select id="projectProvince">${options(PROVINCES)}</select>`)}
      ${field("projectStart", "Site start date", '<input id="projectStart" type="date">')}
    </div>
  </fieldset>

  <fieldset>
    <legend>Scope</legend>
    <div class="f" data-field="trades"><label>Trades in scope *</label>${checkboxes("trades", TRADES)}
      <span class="hint">v1 supports two trades well. More than two is a scoping conversation, not a checkbox.</span>
      <span class="err" hidden></span>
    </div>
    <div class="grid2" style="margin-top:12px">
      ${field("costCodeConvention", "Cost code convention", '<input id="costCodeConvention" placeholder="e.g. CSI 16-digit, internal 6-digit">', "How their cost codes are structured — drives the mapping layer")}
      ${field("bidFormat", "Bid export format", '<select id="bidFormat"><option>CSV</option><option>Excel</option><option>PDF (manual entry)</option><option>Unknown</option></select>')}
    </div>
  </fieldset>

  <fieldset>
    <legend>Integrations</legend>
    <div class="f"><label>Photo source</label>${checkboxes("photoSources", PHOTO_SOURCES)}</div>
    <div class="f" style="margin-top:12px"><label>Labour hours source</label>${checkboxes("hoursSources", HOURS_SOURCES)}
      <span class="hint">Expect dirty cost-code data from timekeeping exports — this drives how much mapping work setup needs.</span>
    </div>
    <p class="hint" style="margin:12px 0 0">
      No credentials are collected here. Integrations connect by OAuth at setup;
      an API key typed into a form ends up in a browser history and a support ticket.
    </p>
  </fieldset>

  <fieldset>
    <legend>Privacy &amp; compliance</legend>
    <div class="checks">
      <label><input type="checkbox" id="workerNotice"> Worker privacy notice issued for this project</label>
      <label><input type="checkbox" id="privacyReview"> PIPA (BC) / PIPEDA review completed</label>
      <label><input type="checkbox" id="offshoreProcessing"> Customer told photo analysis happens outside Canada</label>
    </div>
    <p class="hint" style="margin:12px 0 0">
      No individual-worker data is collected at onboarding or anywhere else. There is
      no per-worker productivity view in the schema, and there never will be.
    </p>
  </fieldset>

  <fieldset>
    <legend>Notes</legend>
    ${field("notes", "Anything the build team needs to know", '<textarea id="notes"></textarea>')}
  </fieldset>

  <p class="hint" style="margin:0 0 12px">
    Completed records are destined for <strong>${escapeHtml(ADMIN_EMAIL)}</strong>.
    No mail transport is wired up yet, so for now download the JSON and send it
    yourself — the page will not pretend it was delivered.
  </p>

  <div class="actions">
    <button type="submit">Create onboarding record</button>
    <button type="button" class="secondary" id="download" hidden>Download JSON</button>
  </div>
</form>

<div id="admin-out" hidden>
  <p id="admin-summary"></p>
  <pre id="admin-json"></pre>
</div>

<script type="module" src="/admin.js"></script>
`;

  return page({
    title: "Admin — client onboarding",
    path: "/admin",
    heading: "Client onboarding",
    lede: "Internal form for standing up a new customer. Local only — not part of the deployed site.",
    projectName: "Internal",
    dataRegion: "ca-central-1",
    body,
    footer: `SiteWireAi admin · records to ${ADMIN_EMAIL} · customer contact ${CONTACT_EMAIL} · local only`,
  });
}
