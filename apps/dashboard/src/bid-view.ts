/**
 * Bid upload and scope-alignment page.
 *
 * The sample bid is deliberately dirty: a zero-hours line, a duplicate cost code,
 * a non-numeric quantity and a code with no matching labour hours. A demo that
 * only ever loads clean data proves nothing about the part that is actually hard.
 */

import type { LabourHoursRecord } from "./types.js";
import { page } from "./ui.js";

const SAMPLE_BID = `cost_code,trade,description,unit,bid_quantity,bid_hours
04-310,Drywall,Level 4 board hang — north wing,sheets,2400,400
04-310,Drywall,Level 4 board hang — south wing,sheets,1800,300
04-320,Drywall,Level 5 board hang — north wing,sheets,2400,400
05-100,Framing,Level 5 metal stud partitions,lin ft,3100,172
05-200,Framing,Level 6 metal stud partitions,lin ft,2900,0
06-050,Blocking,Misc backing and blocking,ea,"1,250",90
07-010,Firestopping,Penetration firestopping,ea,TBD,60
`;

const BID_STYLES = `
  .uploader { background: var(--panel); border: 1px dashed var(--line);
    border-radius: 8px; padding: 18px; text-align: center; color: var(--muted); }
  .uploader input { display: none; }
  .btnrow { display: flex; gap: 8px; justify-content: center; margin-top: 10px;
    flex-wrap: wrap; }
  .btnish { display: inline-block; padding: 8px 14px; border: 1px solid var(--line);
    border-radius: 6px; cursor: pointer; color: var(--ink); background: var(--bg);
    font: inherit; font-size: 14px; }
  .btnish:hover { border-color: var(--accent); }
  .summary { display: flex; gap: 18px; flex-wrap: wrap; margin: 14px 0 10px;
    font-size: 14px; color: var(--ink-2); }
  .probs { margin: 0; padding-left: 16px; font-size: 12px; color: var(--critical); }
  tr.bad td { background: color-mix(in srgb, var(--critical) 6%, transparent); }
  .maprow { display: grid; grid-template-columns: 1fr 1.4fr auto; gap: 12px;
    align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line);
    font-size: 14px; }
  .maprow:last-child { border-bottom: none; }
  .maprow select { padding: 7px 9px; font: inherit; font-size: 13px;
    color: var(--ink); background: var(--bg); border: 1px solid var(--line);
    border-radius: 6px; max-width: 100%; }
  .tag { display: inline-block; padding: 3px 9px; border-radius: 999px;
    font-size: 12px; font-weight: 600; border: 1px solid currentColor; }
  .tag.ok { color: var(--good); }
  .tag.warn { color: #8a5b00; }
  .tag.bad { color: var(--critical); }
  @media (prefers-color-scheme: dark) { .tag.warn { color: var(--warning); } }
  #bid-error { border: 1px solid var(--critical); border-radius: 6px;
    padding: 10px 12px; font-size: 14px;
    background: color-mix(in srgb, var(--critical) 10%, transparent); }
  @media (max-width: 780px) { .maprow { grid-template-columns: 1fr; gap: 6px; } }
`;

export function bidView(
  project: { name: string; dataRegion: string },
  hours: LabourHoursRecord[],
): string {
  // Cost codes as the timekeeping export delivers them: the flagged record carries
  // its code inside the flag, which is exactly the shape the mapping layer exists
  // to clean up.
  const incoming = hours.map((h) => {
    const flagged = h.normalizationFlags.find((f) => f.startsWith("unmapped_cost_code:"));
    const codeFromFlag = flagged?.split(":")[1];
    const code =
      codeFromFlag ??
      (h.scopeItemId === "scope-drywall-l4"
        ? "04-310"
        : h.scopeItemId === "scope-drywall-l5"
          ? "04-320"
          : "05-100");
    return { costCode: code, hours: h.hours, sourceSystem: h.sourceSystem };
  });

  const json = JSON.stringify(incoming).replace(/</g, "\\u003c");
  const sample = SAMPLE_BID.replace(/</g, "\\u003c");

  const body = `
<style>${BID_STYLES}</style>

<div class="note" style="margin-bottom:16px">
  <strong>This is the mapping layer, not a direct join.</strong> Cost-code data from
  timekeeping systems arrives dirty, so a bid line and an hours record are matched
  through an explicit mapping a human can correct. Anything unmapped or ambiguous is
  held back and shown — never quietly joined into a productivity factor.
</div>

<div class="uploader">
  Upload a bid export as CSV
  <div class="muted" style="font-size:13px;margin-top:6px">
    Columns: <code>cost_code, trade, description, unit, bid_quantity, bid_hours</code>
  </div>
  <div class="btnrow">
    <label class="btnish" for="bid-file">Choose CSV</label>
    <button type="button" class="btnish" id="load-sample">Load sample bid</button>
  </div>
  <input id="bid-file" type="file" accept=".csv,text/csv">
</div>

<p id="bid-error" hidden></p>

<h2>Bid lines</h2>
<div id="bid-table"></div>

<h2>Cost-code alignment</h2>
<p class="muted" style="margin-top:-4px">
  Only an unambiguous single match auto-maps. A duplicated cost code stays unmapped
  and waits for a human rather than silently picking the first line.
</p>
<div id="alignment"></div>

<script type="application/json" id="incoming-hours">${json}</script>
<script type="text/plain" id="sample-bid">${sample}</script>
<script type="module" src="/bid.js"></script>
`;

  return page({
    title: `Bid alignment — ${project.name}`,
    path: "/bid",
    heading: "Bid & scope alignment",
    lede: "Upload a bid, derive the budgeted rate per scope item, and map labour cost codes onto it. A line with zero bid hours yields no rate at all — those fall back to crew-relative trending rather than a fabricated number.",
    projectName: project.name,
    dataRegion: project.dataRegion,
    body,
    footer: "Sitewire demo · client-side only · nothing uploaded",
  });
}
