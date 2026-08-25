/**
 * Contact and Help — dev-only for now, mounted alongside admin.
 *
 * The contact form composes a message and hands it to the visitor's mail client
 * rather than posting it anywhere. There is no mail transport behind this, and a
 * form that shows "Thanks, we'll be in touch" while dropping the message on the
 * floor is worse than no form at all. When SES (or similar) is wired up, the
 * submit handler changes and the page does not.
 */

import { CONTACT_EMAIL } from "./emails.js";
import { escapeHtml, page } from "./ui.js";

const CONTACT_STYLES = `
  .contact-grid { display: grid; gap: 18px; grid-template-columns: 1.2fr 1fr;
    align-items: start; }
  @media (max-width: 860px) { .contact-grid { grid-template-columns: 1fr; } }
  .card { background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 18px; }
  .card h2 { margin-top: 0; }
  .f { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
  .f label { font-size: 12px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); }
  .f input, .f select, .f textarea { padding: 9px 11px; font: inherit; font-size: 14px;
    color: var(--ink); background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; width: 100%; }
  .f textarea { min-height: 130px; resize: vertical; }
  .f .err { font-size: 12px; color: var(--critical); }
  .f.bad input, .f.bad textarea { border-color: var(--critical); }
  .mailbtn { padding: 10px 16px; border-radius: 6px; font: inherit; font-weight: 600;
    cursor: pointer; border: 1px solid var(--accent); background: var(--accent);
    color: #fff; }
  .addr { font-size: 15px; font-weight: 600; }
  .addr a { color: var(--accent); }
  .faq { margin: 0; }
  .faq dt { font-weight: 600; margin-top: 14px; }
  .faq dt:first-child { margin-top: 0; }
  .faq dd { margin: 4px 0 0; color: var(--ink-2); font-size: 14px; }
  .devnote { border: 1px solid var(--warning); border-left-width: 4px;
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    padding: 12px 14px; border-radius: 6px; margin-bottom: 18px; font-size: 14px; }
`;

const devNote = `<div class="devnote">
  <strong>Dev only.</strong> This page is served by the local dev server and is not
  on the deployed site yet. Nothing here sends mail — there is no mail transport
  wired up, so the form opens your mail client instead of pretending to deliver.
</div>`;

export function contactView(): string {
  const body = `
<style>${CONTACT_STYLES}</style>
${devNote}

<div class="contact-grid">
  <form class="card" id="contact-form" novalidate>
    <h2>Send us a message</h2>

    <div class="f" data-field="cName">
      <label for="cName">Your name *</label>
      <input id="cName">
      <span class="err" hidden></span>
    </div>

    <div class="f" data-field="cEmail">
      <label for="cEmail">Your email *</label>
      <input id="cEmail" type="email">
      <span class="err" hidden></span>
    </div>

    <div class="f" data-field="cCompany">
      <label for="cCompany">Company</label>
      <input id="cCompany">
      <span class="err" hidden></span>
    </div>

    <div class="f" data-field="cTopic">
      <label for="cTopic">Topic</label>
      <select id="cTopic">
        <option>General enquiry</option>
        <option>Product demo</option>
        <option>Support with a project</option>
        <option>Evidence package / adjudication</option>
        <option>Privacy or data residency</option>
        <option>Billing</option>
      </select>
      <span class="err" hidden></span>
    </div>

    <div class="f" data-field="cMessage">
      <label for="cMessage">Message *</label>
      <textarea id="cMessage"></textarea>
      <span class="err" hidden></span>
    </div>

    <button type="submit" class="mailbtn">Open in mail client</button>
    <p id="contact-status" class="muted" style="margin:10px 0 0;font-size:13px"></p>
  </form>

  <div class="card">
    <h2>Reach us directly</h2>
    <p class="addr">
      <a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a>
    </p>
    <p class="muted" style="font-size:14px">
      For anything about a project, a report, an integration, or a demo. We aim to
      answer within one business day.
    </p>
    <h2 style="margin-top:22px">Data &amp; privacy</h2>
    <p class="muted" style="font-size:14px">
      All media and derived data is held in a Canadian region
      (<code>ca-central-1</code>). Faces are blurred at ingest and unblurred
      originals are never stored. There is no individual-worker productivity view
      anywhere in the product.
    </p>
  </div>
</div>

<script type="module" src="/contact.js"></script>
`;

  return page({
    title: "Contact — SiteWireAi",
    path: "/contact",
    heading: "Contact",
    lede: "Questions about a project, a report, or getting set up.",
    projectName: "SiteWireAi",
    dataRegion: "ca-central-1",
    body,
    footer: `SiteWireAi · ${CONTACT_EMAIL} · dev only`,
  });
}

export function helpView(): string {
  const body = `
<style>${CONTACT_STYLES}</style>
${devNote}

<div class="contact-grid">
  <div class="card">
    <h2>Common questions</h2>
    <dl class="faq">
      <dt>What does the productivity factor actually mean?</dt>
      <dd>Actual install rate divided by the bid rate. 1.00 is on bid; 0.60 means
        installing at 60% of the rate the job was bid at.</dd>

      <dt>Why is a scope item missing from the numbers?</dt>
      <dd>A factor only appears when quantity and labour hours both resolve for the
        same date. A gap is shown as a gap rather than filled with a zero, because a
        zero looks like catastrophic productivity instead of missing data.</dd>

      <dt>Why was a labour-hours record held back?</dt>
      <dd>Its cost code was unmapped or ambiguous. Those are surfaced on the Bid
        alignment page rather than joined, so a bad cost code cannot quietly become
        a productivity factor. Map it there and it joins.</dd>

      <dt>What does "abstained" mean on an estimate?</dt>
      <dd>The model declined to give a number rather than guess at low confidence.
        It is absent from the maths, not counted as zero.</dd>

      <dt>Why can't I generate a report yet?</dt>
      <dd>A report is only released once every figure in it resolves back to a
        source capture and labour-hours record. That traceability is what makes the
        package credible in front of an adjudicator.</dd>

      <dt>Is the BC adjudication export ready to file?</dt>
      <dd>No, and it says so on its face. BC's Construction Prompt Payment Act
        regulations were still in consultation as of mid-2026, with no in-force date
        and no designated authority. The export is shaped against Ontario practice
        as a working draft. Sitewire does not file anything on your behalf.</dd>

      <dt>What happens to faces in photos?</dt>
      <dd>They are redacted before anything is stored — on device, and re-checked
        server-side at ingest. Two independent passes.</dd>

      <dt>Does the AI set quantities?</dt>
      <dd>No. It can fill in the area, scope item and date for you to review, and
        describe what is visible in a photo. It cannot set an estimated quantity,
        an abstention, or a face-blur declaration.</dd>
    </dl>
  </div>

  <div class="card">
    <h2>Still stuck?</h2>
    <p class="addr">
      <a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a>
    </p>
    <p class="muted" style="font-size:14px">
      Include the project name and, if it is about a figure, the scope item and
      date. That is usually enough to trace it back to the source rows.
    </p>
  </div>
</div>
`;

  return page({
    title: "Help — SiteWireAi",
    path: "/help",
    heading: "Help",
    lede: "How the numbers are derived, and what the product will not do.",
    projectName: "SiteWireAi",
    dataRegion: "ca-central-1",
    body,
    footer: `SiteWireAi · ${CONTACT_EMAIL} · dev only`,
  });
}
