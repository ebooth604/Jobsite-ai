/**
 * The Assist tab — stages one and two, with a human gate after each.
 *
 * This is where the two commodity models do their automatic work and a person
 * says yes or no to it, one proposal at a time:
 *
 *   Stage 1  YOLO11 detects   →  boxes appear as pending. Accept or reject each.
 *   Stage 2  YOLO11-seg outlines →  a box becomes an outline, also pending.
 *                                Accept or reject that too.
 *
 * Nothing a model produced is written to the sample until a human has accepted it.
 * That is deliberate and, for now, absolute: both gates are on regardless of how
 * confident either model is. As the fine-tuned detector earns trust, the threshold
 * is what relaxes — the gate stays, and starts letting confident proposals through
 * rather than being removed.
 *
 * A separate tab rather than a panel inside the sample editor, because it is a
 * different rhythm of work. Confirming geometry is fast and repetitive — a
 * hundred yes/no decisions in a few minutes. Labelling ground truth is slow and
 * considered. Putting them on one screen makes the screen bad at both.
 */

import { REGION_CLASSES, type TrainingSample } from "./dataset.js";
import { escapeHtml, jsonBlock, page } from "./ui.js";

const ASSIST_STYLES = `
  .assist { display: grid; gap: 16px; grid-template-columns: 1fr 340px; align-items: start; }
  @media (max-width: 1040px) { .assist { grid-template-columns: 1fr; } }
  .stagewrap { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px; position: sticky; top: 12px; }
  canvas.stage { max-width: 100%; border-radius: 6px; display: block; }
  .steps { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .step { flex: 1 1 0; min-width: 140px; border: 1px solid var(--line); border-radius: 8px;
    padding: 10px 12px; background: var(--bg); }
  .step.active { border-color: var(--accent); }
  .step.done { border-color: var(--good); }
  .step-n { font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
    color: var(--muted); }
  .step strong { display: block; font-size: 14px; margin: 2px 0; }
  .step span { font-size: 12px; color: var(--muted); }
  .pending { background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 10px 12px; margin-bottom: 8px; font-size: 13px; }
  .pending.on { border-color: var(--accent); }
  .pending-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .pending-head .sw { width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto; }
  .pending-head strong { font-size: 13px; }
  .pending-head .conf { margin-left: auto; color: var(--muted); font-size: 12px;
    font-variant-numeric: tabular-nums; }
  .pending-acts { display: flex; gap: 6px; flex-wrap: wrap; }
  .pending-acts button { padding: 4px 10px; font-size: 12px; }
  .assist-empty { color: var(--muted); font-size: 13px; padding: 12px 0; }
`;

export function assistView(samples: readonly TrainingSample[], storePath: string): string {
  // Drafts first: a sample nobody has touched is the one most likely to need
  // geometry. Beyond that, newest first, matching every other listing.
  const candidates = [...samples].sort((a, b) => {
    const rank = (s: TrainingSample) => (s.status === "draft" ? 0 : 1);
    return rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt);
  });

  const options = candidates
    .map(
      (s) =>
        `<option value="${escapeHtml(s.id)}">${escapeHtml(
          `${s.groundTruth.scopeDescription || "Unlabelled"} · ${s.projectRef || "no project"} · ${
            s.regions.length
          } region(s)`,
        )}</option>`,
    )
    .join("");

  const classOptions = REGION_CLASSES.map(
    (c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`,
  ).join("");

  const body =
    samples.length === 0
      ? `<div class="empty">Nothing in the corpus yet. <a href="/intake">Add photos</a> first.</div>`
      : `
<style>${ASSIST_STYLES}</style>

<div class="steps">
  <div class="step done">
    <span class="step-n">Stage 1</span>
    <strong>YOLO11 · detect</strong>
    <span>Finds things. Returns boxes. Knows nothing about what they mean.</span>
  </div>
  <div class="step done">
    <span class="step-n">Stage 2</span>
    <strong>YOLO11s-seg · segment</strong>
    <span>Outlines what stage one found, in about a second. Geometry only.</span>
  </div>
  <div class="step active">
    <span class="step-n">Stage 3</span>
    <strong>You</strong>
    <span>Accept or reject each one. Nothing is written until you do.</span>
  </div>
</div>

<div class="note" style="margin-bottom:16px">
  <strong>Both gates are on, for now.</strong> Every proposal from either model waits
  for a yes. That is heavier than it will stay — as the detector is fine-tuned on real
  SiteWire data and earns its confidence, the threshold is what relaxes. The gate
  itself stays, and starts letting confident proposals through rather than being
  removed. Which model proposed each region is stored either way.
</div>

<div class="assist">
  <div>
    <div class="stagewrap">
      <div class="field" style="margin-bottom:10px">
        <label for="sample">Sample</label>
        <select id="sample">${options}</select>
      </div>

      <div class="btnrow" style="margin-bottom:10px">
        <button type="button" class="btn" id="detect">1 · Detect</button>
        <button type="button" class="btn" id="detect-people">1 · Detect people</button>
        <select id="region-class" style="padding:8px 10px;background:var(--bg);color:var(--ink);
          border:1px solid var(--line);border-radius:6px">${classOptions}</select>
      </div>
      <p id="assist-status" class="field-hint" style="margin:0 0 10px"></p>

      <canvas id="stage" class="stage"></canvas>
      <p class="field-hint">
        Dashed outlines are pending. Solid ones are already on the sample. Click a
        pending item on the right to highlight it here.
      </p>
    </div>
  </div>

  <div>
    <div class="panel">
      <h2 style="margin-top:0">Pending <span id="pending-count" class="muted"></span></h2>
      <p class="field-hint" style="margin-top:-4px">
        Accept adds the region and records which model proposed it. Segment hands the
        box to YOLO11s-seg and brings back an outline to confirm separately.
      </p>
      <div id="pending"></div>
      <div class="btnrow" style="margin-top:10px">
        <button type="button" class="btn" id="accept-all">Accept all</button>
        <button type="button" class="btn danger" id="reject-all">Reject all</button>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <h2 style="margin-top:0">On the sample <span id="region-count" class="muted"></span></h2>
      <div id="regions"></div>
      <div class="btnrow" style="margin-top:10px">
        <button type="button" class="btn primary" id="save">Save regions</button>
        <span id="save-status" class="muted" style="font-size:13px"></span>
      </div>
      <p class="field-hint">
        Ground truth, conditions and the rest are set in the
        <a href="/">sample editor</a>. This tab only does geometry.
      </p>
    </div>
  </div>
</div>

<script type="application/json" id="samples">${jsonBlock(
          candidates.map((s) => ({
            id: s.id,
            imageFile: s.imageFile,
            width: s.width,
            height: s.height,
            regions: s.regions,
          })),
        )}</script>
<script type="module" src="/assist.js"></script>
`;

  return page({
    title: "Assist",
    path: "/assist",
    heading: "Assist",
    lede: "YOLO11 detects, YOLO11-seg outlines, and you confirm each one before it becomes a region.",
    storePath,
    sampleCount: samples.length,
    body,
  });
}
