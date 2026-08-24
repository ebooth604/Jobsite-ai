/**
 * The capture console page.
 *
 * The scope items are handed to the client as a JSON <script> block rather than
 * interpolated into executable JS — a `type="application/json"` block is data, so
 * a description containing a quote or a `</script>` cannot become code.
 */

import type { ScopeItem } from "./types.js";
import { escapeHtml, page } from "./ui.js";

const CAPTURE_STYLES = `
  .capture-grid { display: grid; gap: 16px; grid-template-columns: 1fr 320px;
    align-items: start; }
  @media (max-width: 900px) { .capture-grid { grid-template-columns: 1fr; } }

  #drop { border: 1px dashed var(--line); border-radius: 8px; background: var(--panel);
    padding: 18px; text-align: center; color: var(--muted); }
  #drop.over { border-color: var(--accent); color: var(--ink); }
  #drop input { display: none; }
  .filebtn { display: inline-block; margin-top: 8px; padding: 8px 14px;
    border: 1px solid var(--line); border-radius: 6px; cursor: pointer;
    color: var(--ink); background: var(--bg); font-size: 14px; }
  .filebtn:hover { border-color: var(--accent); }

  #thumbs { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
  .thumb { position: relative; padding: 0; border: 2px solid var(--line);
    border-radius: 6px; background: var(--panel); cursor: pointer; line-height: 0; }
  .thumb.active { border-color: var(--accent); }
  .thumb canvas { max-width: 96px; max-height: 96px; border-radius: 4px; }
  .thumb-tag { position: absolute; right: -6px; top: -6px; min-width: 18px;
    height: 18px; border-radius: 999px; font-size: 11px; line-height: 18px;
    font-weight: 700; color: #fff; }
  .thumb-tag.ok { background: var(--good); }
  .thumb-tag.todo { background: var(--critical); }

  #stage { background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 12px; margin-top: 12px; }
  #editor { max-width: 100%; border-radius: 4px; cursor: crosshair;
    touch-action: none; display: block; }
  .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .toolbar button { padding: 7px 12px; border: 1px solid var(--line);
    border-radius: 6px; background: var(--bg); color: var(--ink); cursor: pointer;
    font-size: 13px; }
  .toolbar button:hover { border-color: var(--accent); }

  .form { background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 16px; }
  .field { margin-bottom: 12px; }
  .field label { display: block; font-size: 12px; text-transform: uppercase;
    letter-spacing: .05em; color: var(--muted); margin-bottom: 4px; }
  .field input, .field select { width: 100%; padding: 8px 10px; font: inherit;
    font-size: 14px; color: var(--ink); background: var(--bg);
    border: 1px solid var(--line); border-radius: 6px; }
  .field input:disabled { opacity: .5; }
  .check { display: flex; gap: 8px; align-items: flex-start; font-size: 14px;
    margin-bottom: 12px; }
  .check input { margin-top: 3px; }
  .gate { font-size: 13px; border-radius: 6px; padding: 10px 12px; margin: 12px 0; }
  .gate.ok { border: 1px solid var(--good); color: var(--ink);
    background: color-mix(in srgb, var(--good) 10%, transparent); }
  .gate.todo { border: 1px solid var(--critical); color: var(--ink);
    background: color-mix(in srgb, var(--critical) 10%, transparent); }
  .primary { width: 100%; padding: 10px 14px; border-radius: 6px; font: inherit;
    font-weight: 600; cursor: pointer; border: 1px solid var(--accent);
    background: var(--accent); color: #fff; }
  .primary:disabled { opacity: .45; cursor: not-allowed; }

  .queued { display: grid; grid-template-columns: 84px 1fr auto; gap: 12px;
    align-items: start; background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 12px; margin-bottom: 10px; font-size: 13px; }
  .queued img { width: 84px; border-radius: 4px; }
  .chip { display: inline-block; margin: 4px 6px 0 0; padding: 2px 8px;
    border-radius: 999px; border: 1px solid var(--line); font-size: 11px;
    color: var(--muted); }
  .linkish { color: var(--accent); font-size: 13px; white-space: nowrap; }
`;

export function captureView(
  project: {
    name: string;
    dataRegion: string;
  },
  scopeItems: ScopeItem[],
): string {
  const scopeJson = JSON.stringify(
    scopeItems.map((s) => ({
      id: s.id,
      trade: s.trade,
      description: s.description,
      unitOfMeasure: s.unitOfMeasure,
    })),
  ).replace(/</g, "\\u003c");

  const body = `
<style>${CAPTURE_STYLES}</style>

<div class="note" style="margin-bottom:16px">
  <strong>Nothing here is uploaded.</strong> Photos are read, redacted and previewed
  entirely in this browser tab — no byte is sent anywhere. That mirrors the real
  capture path: the mobile app redacts faces <em>on-device before sending</em>, and
  the ingestion service re-checks server-side regardless. Two independent passes,
  because a client-side bug is not an acceptable failure mode for a promise made in
  a contract.
</div>

<div class="capture-grid">
  <div>
    <div id="drop">
      Drop photos here
      <div><label class="filebtn" for="file">Choose photos</label></div>
      <input id="file" type="file" accept="image/*" multiple>
    </div>

    <div id="thumbs"></div>

    <div id="empty-state" class="empty" style="margin-top:12px">
      Add a photo to start redacting.
    </div>

    <div id="stage" hidden>
      <div class="toolbar">
        <button type="button" id="rotate">Rotate 90°</button>
        <button type="button" id="undo">Undo redaction</button>
        <button type="button" id="clear">Clear redactions</button>
      </div>
      <canvas id="editor"></canvas>
      <p class="muted" style="margin:10px 0 0;font-size:13px">
        Drag across a face to redact it. Regions are mosaicked, not softly blurred —
        averaging whole blocks is not reversible the way a gaussian often is.
      </p>
    </div>
  </div>

  <div class="form">
    <h2 style="margin-top:0">Capture parameters</h2>

    <div class="field">
      <label for="scope">Scope item</label>
      <select id="scope"></select>
    </div>

    <div class="field">
      <label for="area">Area</label>
      <input id="area" type="text" placeholder="L5 north corridor">
    </div>

    <div class="field">
      <label for="captured-at">Captured on</label>
      <input id="captured-at" type="date">
    </div>

    <div class="field">
      <label for="origin">Proposed origin</label>
      <select id="origin">
        <option value="field">field</option>
        <option value="self_measured">self_measured</option>
        <option value="simulated">simulated</option>
      </select>
    </div>
    <p class="muted" style="font-size:12px;margin:-6px 0 12px">
      Proposed only. <code>origin</code> is set authoritatively by the ingestion
      service and never inferred later — that is what keeps the simulated-capture
      leak assertion enforceable.
    </p>

    <div class="field">
      <label for="quantity">Estimated quantity</label>
      <input id="quantity" type="number" min="0" step="1" placeholder="e.g. 47">
    </div>

    <div class="check">
      <input id="abstain" type="checkbox">
      <label for="abstain" style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink)">
        Abstain — confidence too low to give a number
      </label>
    </div>

    <div class="check">
      <input id="no-people" type="checkbox">
      <label for="no-people" style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink)">
        No people in frame
      </label>
    </div>

    <p id="gate-status" class="gate todo"></p>

    <button type="button" id="queue" class="primary" disabled>Queue capture</button>
  </div>
</div>

<h2>Prepared captures (<span id="queue-count">0</span>)</h2>
<div id="queue-list"></div>

<script type="application/json" id="scope-items">${scopeJson}</script>
<script type="module" src="/capture.js"></script>
`;

  return page({
    title: `Capture — ${project.name}`,
    path: "/capture",
    heading: "Capture console",
    lede: "Upload photos, redact faces before anything is stored, set the capture parameters, and prepare them for ingest.",
    projectName: project.name,
    dataRegion: project.dataRegion,
    body,
    footer: `Sitewire demo · client-side only · nothing uploaded · ${escapeHtml(project.dataRegion)}`,
  });
}
