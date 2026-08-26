/**
 * The two working surfaces: intake and the sample editor.
 *
 * They are split because they are different jobs done at different times. Intake
 * is a batch — twenty photos off a phone, one project, one afternoon, and the only
 * decision that matters is the redaction one. Labelling is one photo at a time,
 * slowly, with a tape measure's worth of context in front of you. Trying to do
 * both on one screen produces a screen that is bad at both.
 *
 * The hard rule intake enforces: a photo cannot be added to the corpus until its
 * faces are mosaicked or a named person has declared the frame free of people.
 * Redaction happens on the canvas, and the *redacted render* is what gets
 * uploaded — the original bytes never leave the tab.
 *
 * Taxonomy and sample data reach the browser through `type="application/json"`
 * blocks rather than interpolated JavaScript, so a scope description containing a
 * quote or a `</script>` is data rather than code.
 */

import {
  CONDITION_TYPES,
  GROUND_TRUTH_SOURCES,
  HARD_CASES,
  MEASUREMENT_METHODS,
  REGION_CLASSES,
  SOURCE_LABELS,
  SPLIT_LABELS,
  type Split,
  TRADES,
  type TrainingSample,
} from "./dataset.js";
import { availableSplits, blocks, labelReadiness, splitBlockedReason } from "./guards.js";
import { escapeHtml, jsonBlock, page } from "./ui.js";

/** Everything the browser needs to render the vocabulary controls. */
function taxonomyBlock(): string {
  return jsonBlock({
    trades: TRADES,
    regionClasses: REGION_CLASSES,
    conditionTypes: CONDITION_TYPES,
    hardCases: HARD_CASES,
    measurementMethods: MEASUREMENT_METHODS,
  });
}

const INTAKE_STYLES = `
  .intake-grid { display: grid; gap: 16px; grid-template-columns: 300px 1fr;
    align-items: start; }
  @media (max-width: 940px) { .intake-grid { grid-template-columns: 1fr; } }
  #drop { border: 1px dashed var(--line); border-radius: 10px; background: var(--panel);
    padding: 26px; text-align: center; color: var(--muted); }
  #drop.over { border-color: var(--accent); color: var(--ink); }
  #drop input { display: none; }
  .filebtn { display: inline-block; margin-top: 10px; padding: 8px 14px;
    border: 1px solid var(--line); border-radius: 6px; cursor: pointer; color: var(--ink);
    background: var(--bg); font-size: 14px; }
  .filebtn:hover { border-color: var(--accent); }
  #thumbs { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0; }
  .thumb { position: relative; padding: 0; border: 2px solid var(--line); border-radius: 6px;
    background: var(--panel); cursor: pointer; line-height: 0; }
  .thumb.active { border-color: var(--accent); }
  .thumb canvas { max-width: 84px; max-height: 84px; border-radius: 4px; }
  .thumb-tag { position: absolute; right: -6px; top: -6px; min-width: 18px; height: 18px;
    border-radius: 999px; font-size: 11px; line-height: 18px; font-weight: 700; color: #fff;
    text-align: center; padding: 0 4px; }
  .thumb-tag.ok { background: var(--good); }
  .thumb-tag.todo { background: var(--critical); }
  #editor-wrap { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px; }
  canvas.stage { max-width: 100%; border-radius: 6px; display: block; cursor: crosshair;
    touch-action: none; }
`;

export function intakeView(storePath: string, sampleCount: number): string {
  const sourceOptions = GROUND_TRUTH_SOURCES.map(
    (s) => `<option value="${s}">${escapeHtml(SOURCE_LABELS[s])}</option>`,
  ).join("");

  const body = `
<style>${INTAKE_STYLES}</style>

<div class="note">
  <strong>Redaction happens here, in the browser, before anything is written.</strong>
  Drag across every face; regions are mosaicked by averaging whole blocks, which is
  not reversible the way a soft blur often is. What gets saved to
  <code>${escapeHtml(storePath)}</code> is the <em>redacted render</em> — the original
  file is never read by the server and never leaves this tab. If a frame genuinely
  has nobody in it, say so and put your name to it; that declaration is stored with
  the sample because a privacy review will ask who made it.
  <br><br>
  <strong>The detector proposes; you decide.</strong> With the local YOLO11 sidecar
  running, <em>Find people to redact</em> draws the rectangles for you — the slowest
  part of intake, done in about a second. It will miss someone eventually, and a
  photo with one missed face looks redacted and is not, so a proposed set cannot be
  saved until you confirm it. Which model proposed them is stored beside your
  confirmation.
</div>

<div class="intake-grid" style="margin-top:16px">
  <div class="panel">
    <h2 style="margin-top:0">Batch settings</h2>
    <p class="field-hint" style="margin-top:-4px">Applied to every photo in this batch.
      Per-photo details are set later, when you label it.</p>

    <div class="field">
      <label for="labeller">Your name</label>
      <input id="labeller" type="text" placeholder="E. Booth" autocomplete="name">
      <p class="field-hint">Recorded as the person who declared the redaction.</p>
    </div>

    <div class="field">
      <label for="source">Ground-truth source</label>
      <select id="source">${sourceOptions}</select>
      <p class="field-hint" id="source-note"></p>
    </div>

    <div class="field">
      <label for="project">Project or site</label>
      <input id="project" type="text" placeholder="Kilmer L5">
    </div>

    <div class="field">
      <label for="area">Area</label>
      <input id="area" type="text" placeholder="L5 north corridor">
    </div>

    <div class="field">
      <label for="captured-at">Captured on</label>
      <input id="captured-at" type="date">
      <p class="field-hint">Pre-filled per photo from EXIF where the file carries it.</p>
    </div>

    <div class="field">
      <label for="notes">Capture notes</label>
      <textarea id="notes" placeholder="Second pass after the ceiling grid went in."></textarea>
    </div>

    <p id="gate" class="gate todo"></p>
    <button type="button" id="add" class="btn primary" style="width:100%" disabled>
      Add redacted photos to corpus
    </button>
    <p id="add-status" class="field-hint"></p>
  </div>

  <div>
    <div id="drop">
      Drop jobsite photos here
      <div><label class="filebtn" for="file">Choose photos</label></div>
      <input id="file" type="file" accept="image/*" multiple>
    </div>

    <div id="thumbs"></div>

    <div id="empty" class="empty">Add photos to start redacting.</div>

    <div id="editor-wrap" hidden>
      <div class="btnrow" style="margin-bottom:10px">
        <button type="button" class="btn" id="rotate">Rotate 90°</button>
        <button type="button" class="btn" id="undo">Undo redaction</button>
        <button type="button" class="btn" id="clear">Clear redactions</button>
        <button type="button" class="btn danger" id="discard">Discard photo</button>
      </div>
      <div class="btnrow" style="margin-bottom:10px">
        <button type="button" class="btn" id="find-people" disabled>Find people to redact</button>
        <span id="detector-status" class="field-hint" style="margin:0"></span>
      </div>
      <div class="check" id="confirm-row" hidden>
        <input id="confirm-proposals" type="checkbox">
        <label for="confirm-proposals">
          I have checked every proposed rectangle and there are no unredacted faces left
        </label>
      </div>
      <div class="check">
        <input id="no-people" type="checkbox">
        <label for="no-people">No people in frame — nothing to redact in this photo</label>
      </div>
      <canvas id="stage" class="stage"></canvas>
      <p class="field-hint" id="photo-meta"></p>
    </div>
  </div>
</div>

<script type="application/json" id="taxonomy">${taxonomyBlock()}</script>
<script type="module" src="/intake.js"></script>
`;

  return page({
    title: "Intake",
    path: "/intake",
    heading: "Intake",
    lede: "Bring real photos in, redact faces, and file them against a project. Labelling comes next, one photo at a time.",
    storePath,
    sampleCount,
    body,
  });
}

const SAMPLE_STYLES = `
  .work { display: grid; gap: 16px; grid-template-columns: 1fr 380px; align-items: start; }
  @media (max-width: 1040px) { .work { grid-template-columns: 1fr; } }
  .stagewrap { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    padding: 12px; position: sticky; top: 12px; }
  canvas.stage { max-width: 100%; border-radius: 6px; display: block; cursor: crosshair;
    touch-action: none; }
  .regionlist { margin-top: 10px; font-size: 13px; max-height: 210px; overflow: auto; }
  .regionrow { display: flex; gap: 8px; align-items: center; padding: 5px 0;
    border-bottom: 1px solid var(--line); }
  .regionrow .sw { width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto; }
  .regionrow button { margin-left: auto; }
  .taglist { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
  .tag { padding: 5px 10px; border: 1px solid var(--line); border-radius: 999px;
    background: var(--bg); color: var(--ink-2); font-size: 12px; cursor: pointer; }
  .tag.on { border-color: var(--accent); color: var(--accent); }
  .tag select { margin-left: 6px; background: transparent; border: 0; color: inherit;
    font: inherit; font-size: 11px; }
  .savebar { position: sticky; bottom: 0; background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 12px; margin-top: 14px; display: flex; gap: 10px;
    align-items: center; flex-wrap: wrap; }
`;

/**
 * In blocking mode this both disables the ineligible options and shows the
 * reason. In advisory mode every split stays selectable — the reason still
 * shows as a hint, and `guards.ts` records the resulting violation on the
 * Integrity page rather than the editor refusing the choice.
 */
function splitControl(sample: TrainingSample): string {
  const allowed = availableSplits(sample);
  const enforceHere = blocks();
  const options = (["unassigned", "train", "val", "holdout", "calibration"] as Split[])
    .map((split) => {
      const ineligible = !allowed.includes(split);
      const reason = ineligible ? splitBlockedReason(sample, split) : null;
      const title = reason ? ` title="${escapeHtml(reason)}"` : "";
      const selected = sample.split === split ? " selected" : "";
      const disabled = enforceHere && ineligible ? " disabled" : "";
      const suffix = ineligible ? " — not eligible" : "";
      return `<option value="${split}"${selected}${disabled}${title}>${escapeHtml(
        SPLIT_LABELS[split] + suffix,
      )}</option>`;
    })
    .join("");

  const blockedNow = (["val", "holdout", "calibration"] as Split[])
    .map((split) => ({ split, reason: splitBlockedReason(sample, split) }))
    .filter((entry): entry is { split: Split; reason: string } => entry.reason !== null);

  const reasons = blockedNow.length
    ? `<ul class="field-hint" style="margin:6px 0 0 16px">${blockedNow
        .map((e) => `<li>${escapeHtml(SPLIT_LABELS[e.split])}: ${escapeHtml(e.reason)}</li>`)
        .join("")}</ul>`
    : "";

  return `
    <div class="field">
      <label for="split">Split</label>
      <select id="split">${options}</select>
      ${reasons}
    </div>`;
}

export function sampleView(
  sample: TrainingSample,
  storePath: string,
  sampleCount: number,
  neighbours: { prev: string | null; next: string | null },
): string {
  const readiness = labelReadiness(sample);
  const tradeOptions = TRADES.map(
    (t) =>
      `<option value="${t.id}"${sample.groundTruth.trade === t.id ? " selected" : ""}>${escapeHtml(
        t.label,
      )}</option>`,
  ).join("");
  const methodOptions = MEASUREMENT_METHODS.map(
    (m) =>
      `<option value="${m.id}"${
        sample.groundTruth.method === m.id ? " selected" : ""
      }>${escapeHtml(m.label)}</option>`,
  ).join("");
  const classOptions = REGION_CLASSES.map(
    (c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`,
  ).join("");
  const statusOptions = (["draft", "labelled", "reviewed", "rejected"] as const)
    .map(
      (s) =>
        `<option value="${s}"${sample.status === s ? " selected" : ""}>${escapeHtml(s)}</option>`,
    )
    .join("");

  const prevLink = neighbours.prev
    ? `<a class="btn" href="/sample/${escapeHtml(neighbours.prev)}">← Previous</a>`
    : "";
  const nextLink = neighbours.next
    ? `<a class="btn" href="/sample/${escapeHtml(neighbours.next)}">Next →</a>`
    : "";

  const body = `
<style>${SAMPLE_STYLES}</style>

<div class="btnrow" style="margin-bottom:14px">
  <a class="btn" href="/">← Library</a>
  ${prevLink}${nextLink}
  <span class="chip">${escapeHtml(SOURCE_LABELS[sample.source])}</span>
  <span class="chip${sample.source === "simulated" ? " sim" : ""}">origin: ${escapeHtml(
    sample.origin,
  )}</span>
  <span class="muted" style="font-size:12px;margin-left:auto">
    ${escapeHtml(sample.imageSha256.slice(0, 12))}… · ${sample.width}×${sample.height}
  </span>
</div>

<div class="work">
  <div>
    <div class="stagewrap">
      <div class="btnrow" style="margin-bottom:10px">
        <button type="button" class="btn on" id="tool-box" data-tool="box">Box</button>
        <button type="button" class="btn" id="tool-poly" data-tool="polygon">Polygon</button>
        <select id="region-class" style="padding:8px 10px;background:var(--bg);color:var(--ink);
          border:1px solid var(--line);border-radius:6px">${classOptions}</select>
        <button type="button" class="btn" id="finish-poly" hidden>Finish polygon</button>
        <button type="button" class="btn" id="undo-region">Undo region</button>
      </div>
      <canvas id="stage" class="stage"></canvas>
      <p class="field-hint">
        Drag to draw a box; in polygon mode click each vertex and finish to close it.
        Regions are stored normalised, so they survive any later resize.
      </p>
      <div class="regionlist" id="regions"></div>
    </div>
  </div>

  <div>
    <div class="panel">
      <h2 style="margin-top:0">Ground truth</h2>

      <div class="field">
        <button type="button" class="btn" id="suggest-classification">Suggest classification</button>
        <span id="suggest-status" class="field-hint"></span>
      </div>
      <div id="suggest-reading" class="note" hidden style="margin-bottom:14px"></div>

      <div class="field">
        <label for="trade">Trade</label>
        <select id="trade">${tradeOptions}</select>
      </div>

      <div class="field">
        <label for="scope">What this photo shows</label>
        <input id="scope" type="text" value="${escapeHtml(sample.groundTruth.scopeDescription)}"
          placeholder="Device boxes, north wall, grid line 4–7">
      </div>

      <div class="row">
        <div class="field">
          <label for="quantity">Measured quantity</label>
          <input id="quantity" type="number" min="0" step="any"
            value="${sample.groundTruth.quantity ?? ""}">
        </div>
        <div class="field">
          <label for="unit">Unit</label>
          <select id="unit"></select>
        </div>
      </div>

      <div class="check">
        <input id="abstain" type="checkbox"${sample.groundTruth.abstained ? " checked" : ""}>
        <label for="abstain">Unmeasurable from this photo</label>
      </div>
      <p class="field-hint" style="margin:-4px 0 12px">
        Keep it — a photo nobody can measure is exactly the signal that teaches a model
        to abstain. It can never enter a measuring split, which is enforced below.
      </p>

      <div class="row">
        <div class="field">
          <label for="method">Measurement method</label>
          <select id="method">${methodOptions}</select>
        </div>
        <div class="field">
          <label for="uncertainty">Uncertainty ±%</label>
          <input id="uncertainty" type="number" min="0" step="0.5"
            value="${sample.groundTruth.uncertaintyPct}">
        </div>
      </div>
      <p class="field-hint" id="method-note" style="margin:-6px 0 12px"></p>

      <div class="row">
        <div class="field">
          <label for="measured-by">Measured by</label>
          <input id="measured-by" type="text" value="${escapeHtml(sample.groundTruth.measuredBy)}">
        </div>
        <div class="field">
          <label for="measured-at">Measured on</label>
          <input id="measured-at" type="date" value="${escapeHtml(sample.groundTruth.measuredAt)}">
        </div>
      </div>

      <div class="field">
        <label for="gt-notes">Measurement notes</label>
        <textarea id="gt-notes">${escapeHtml(sample.groundTruth.notes)}</textarea>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <h2 style="margin-top:0">Capture</h2>
      <div class="row">
        <div class="field">
          <label for="project">Project or site</label>
          <input id="project" type="text" value="${escapeHtml(sample.projectRef)}">
        </div>
        <div class="field">
          <label for="captured-at">Captured on</label>
          <input id="captured-at" type="date" value="${escapeHtml(sample.capturedAt)}">
        </div>
      </div>
      <div class="field">
        <label for="area">Area</label>
        <input id="area" type="text" value="${escapeHtml(sample.area)}">
      </div>
      <div class="field">
        <label for="capture-notes">Capture notes</label>
        <textarea id="capture-notes">${escapeHtml(sample.captureNotes)}</textarea>
      </div>
    </div>

    <div class="panel" style="margin-top:14px">
      <h2 style="margin-top:0">Conditions</h2>
      <p class="field-hint" style="margin-top:-4px">Feeds the condition head behind alerting.</p>
      <div class="taglist" id="conditions"></div>

      <h2>Hard cases</h2>
      <p class="field-hint" style="margin-top:-4px">
        Where abstention behaviour is decided. Tag honestly — a corpus of clean photos
        trains a model that is confident in fog.
      </p>
      <div class="taglist" id="hard-cases"></div>
    </div>

    <div class="panel" style="margin-top:14px">
      <h2 style="margin-top:0">Status and split</h2>
      <div class="field">
        <label for="status">Label status</label>
        <select id="status">${statusOptions}</select>
      </div>
      <div class="row">
        <div class="field">
          <label for="reviewed-by">Reviewed by</label>
          <input id="reviewed-by" type="text" value="${escapeHtml(sample.reviewedBy)}"
            placeholder="A second pair of eyes">
        </div>
        <div class="field">
          <label for="labelled-by">Labelled by</label>
          <input id="labelled-by" type="text" value="${escapeHtml(sample.labelledBy)}">
        </div>
      </div>
      <div class="field">
        <label for="review-note">Review note</label>
        <textarea id="review-note">${escapeHtml(sample.reviewNote)}</textarea>
      </div>
      ${splitControl(sample)}
      <p class="field-hint">
        Split options are filtered by ground-truth source. Simulated data may train a
        model and may never measure one (§5.4d) — so it has no measuring split to offer,
        reviewed or not.
      </p>
    </div>

    <p id="gate" class="gate ${readiness.ready ? "ok" : "todo"}"></p>
  </div>
</div>

<div class="savebar">
  <button type="button" class="btn primary" id="save">Save</button>
  <button type="button" class="btn" id="save-next">Save and open next</button>
  <button type="button" class="btn danger" id="delete">Delete sample</button>
  <span id="save-status" class="muted" style="font-size:13px"></span>
</div>

<script type="application/json" id="taxonomy">${taxonomyBlock()}</script>
<script type="application/json" id="sample">${jsonBlock(sample)}</script>
<script type="application/json" id="neighbours">${jsonBlock(neighbours)}</script>
<script type="module" src="/sample.js"></script>
`;

  return page({
    title: `Label ${sample.id.slice(0, 8)}`,
    path: "/",
    heading: sample.groundTruth.scopeDescription || "Unlabelled sample",
    lede: `${sample.projectRef || "No project"} · ${sample.area || "no area"} · captured ${
      sample.capturedAt || "date unknown"
    }`,
    storePath,
    sampleCount,
    body,
  });
}
