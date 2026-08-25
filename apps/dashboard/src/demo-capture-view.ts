/**
 * Annotated demo capture — dev only.
 *
 * The markup layer is inline SVG over the photo, positioned in a 0–100 viewBox
 * with `preserveAspectRatio="none"` so the boxes track the image at any rendered
 * width without JavaScript. Nothing here is interactive; it is a picture of what
 * the annotation layer produces, which is what a demo of it should be.
 */

import { COUNT_THRESHOLD, DEMO_CAPTURE, type DemoCapture, tally } from "./demo-capture.js";
import { escapeHtml, page } from "./ui.js";

const DEMO_STYLES = `
  .cap-wrap { position: relative; background: var(--panel);
    border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .cap-wrap img { display: block; width: 100%; height: auto; }
  .cap-wrap svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .missing { padding: 40px 20px; text-align: center; color: var(--muted);
    border: 1px dashed var(--line); border-radius: 10px; background: var(--panel); }
  .missing code { color: var(--ink); }
  .legend { display: flex; gap: 18px; flex-wrap: wrap; margin: 12px 0 0;
    font-size: 13px; color: var(--ink-2); }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .swatch { width: 16px; height: 10px; border-radius: 2px; border: 2px solid; }
  .sw-sheet { border-color: #2a78d6; background: color-mix(in srgb, #2a78d6 18%, transparent); }
  .sw-low { border-color: #fab219; background: color-mix(in srgb, #fab219 18%, transparent); }
  .sw-cond { border-color: #d03b3b; background: color-mix(in srgb, #d03b3b 14%, transparent); }
  .sw-plane { border-color: #0ca30c; background: transparent; }
  .meta { display: grid; gap: 10px; margin-top: 16px;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .meta .m { background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; padding: 12px 14px; }
  .meta .k { font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); }
  .meta .v { font-size: 17px; font-weight: 650; margin-top: 2px;
    font-variant-numeric: tabular-nums; }
  .meta .s { font-size: 12px; color: var(--ink-2); }
  .condlist { margin: 8px 0 0; padding-left: 18px; font-size: 14px; }
  .devnote { border: 1px solid var(--warning); border-left-width: 4px;
    background: color-mix(in srgb, var(--warning) 10%, transparent);
    padding: 12px 14px; border-radius: 6px; margin-bottom: 18px; font-size: 14px; }
`;

/** SVG overlay in a 0-100 box; percentages map straight from normalized coords. */
export function markupSvg(capture: DemoCapture): string {
  const pct = (n: number) => (n * 100).toFixed(2);

  const planes = capture.planes
    .map(
      (p) =>
        `<rect x="${pct(p.box.x)}" y="${pct(p.box.y)}" width="${pct(p.box.w)}" height="${pct(p.box.h)}"
           fill="none" stroke="#0ca30c" stroke-width="0.35" stroke-dasharray="1.6 1.2"
           vector-effect="non-scaling-stroke"/>
         <text x="${pct(p.box.x + 0.006)}" y="${pct(p.box.y + 0.032)}" font-size="2.1"
           fill="#0ca30c" font-family="ui-sans-serif, system-ui" font-weight="600"
           paint-order="stroke" stroke="#0b0b0b" stroke-width="0.55" stroke-opacity="0.65"
           >${escapeHtml(p.label)}</text>`,
    )
    .join("");

  const sheets = capture.sheets
    .map((s) => {
      const low = s.confidence < COUNT_THRESHOLD;
      const colour = low ? "#fab219" : "#2a78d6";
      return `<rect x="${pct(s.x)}" y="${pct(s.y)}" width="${pct(s.w)}" height="${pct(s.h)}"
          fill="${colour}" fill-opacity="0.14" stroke="${colour}" stroke-width="0.3"
          vector-effect="non-scaling-stroke"/>
        <text x="${pct(s.x + s.w / 2)}" y="${pct(s.y + s.h / 2)}" font-size="1.9"
          text-anchor="middle" fill="${colour}" font-family="ui-sans-serif, system-ui"
          font-weight="600" paint-order="stroke" stroke="#0b0b0b" stroke-width="0.5"
          stroke-opacity="0.65">${s.confidence.toFixed(2)}</text>`;
    })
    .join("");

  const conditions = capture.conditions
    .map(
      (c) =>
        `<rect x="${pct(c.x)}" y="${pct(c.y)}" width="${pct(c.w)}" height="${pct(c.h)}"
           fill="#d03b3b" fill-opacity="0.1" stroke="#d03b3b" stroke-width="0.4"
           stroke-dasharray="2 1" vector-effect="non-scaling-stroke"/>
         <text x="${pct(c.x + 0.005)}" y="${pct(c.y + c.h - 0.012)}" font-size="2.1"
           fill="#d03b3b" font-family="ui-sans-serif, system-ui" font-weight="600"
           paint-order="stroke" stroke="#0b0b0b" stroke-width="0.55" stroke-opacity="0.65"
           >${escapeHtml(c.type)} ${c.confidence.toFixed(2)}</text>`,
    )
    .join("");

  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img"
    aria-label="Annotated capture: detected board, wall planes and flagged conditions">
    ${planes}${sheets}${conditions}
  </svg>`;
}

export function demoCaptureView(imageUrl: string | null): string {
  const c = DEMO_CAPTURE;
  const t = tally(c);

  const figure = imageUrl
    ? `<div class="cap-wrap">
         <img src="${escapeHtml(imageUrl)}" alt="Drywall room, ${escapeHtml(c.area)}">
         ${markupSvg(c)}
       </div>`
    : `<div class="missing">
         <p><strong>Demo photo not found.</strong></p>
         <p>Save it as <code>apps/dashboard/static/demo/drywall-l4.&lt;ext&gt;</code>
            (any of .webp .jpg .jpeg .png .avif) and reload. The annotation layer
            below is already wired to it.</p>
       </div>`;

  const conditions = c.conditions
    .map(
      (x) =>
        `<li><strong>${escapeHtml(x.type)}</strong> — ${escapeHtml(x.label)}
         <span class="muted">(confidence ${x.confidence.toFixed(2)})</span></li>`,
    )
    .join("");

  const body = `
<style>${DEMO_STYLES}</style>

<div class="devnote">
  <strong>Real photograph, invented numbers.</strong> Every box, count and
  confidence on this image was made up for the demo — nobody measured this room.
  The capture is <code>origin: "simulated"</code>, so it can never enter a held-out
  set or contribute to an accuracy figure. Dev only; not on the deployed site.
</div>

${figure}

<div class="legend">
  <span><i class="swatch sw-sheet"></i> counted board (≥ ${COUNT_THRESHOLD.toFixed(2)})</span>
  <span><i class="swatch sw-low"></i> below threshold — shown, not counted</span>
  <span><i class="swatch sw-plane"></i> segmented wall plane</span>
  <span><i class="swatch sw-cond"></i> flagged condition</span>
</div>

<div class="meta">
  <div class="m"><div class="k">Counted board</div>
    <div class="v">${t.counted}</div>
    <div class="s">${t.belowThreshold} below threshold, excluded</div></div>
  <div class="m"><div class="k">Mean confidence</div>
    <div class="v">${t.meanConfidence.toFixed(2)}</div>
    <div class="s">across counted detections only</div></div>
  <div class="m"><div class="k">Abstained</div>
    <div class="v">${t.abstained ? "Yes" : "No"}</div>
    <div class="s">abstention is absence, never zero</div></div>
  <div class="m"><div class="k">Face blur</div>
    <div class="v">${escapeHtml(c.faceBlurStatus)}</div>
    <div class="s">no people in frame to redact</div></div>
  <div class="m"><div class="k">Origin</div>
    <div class="v">${escapeHtml(c.origin)}</div>
    <div class="s">set at ingest, never inferred later</div></div>
  <div class="m"><div class="k">Model</div>
    <div class="v" style="font-size:14px">${escapeHtml(c.modelVersion)}</div>
    <div class="s">${escapeHtml(c.area)} · ${escapeHtml(c.capturedAt)}</div></div>
</div>

<h2>Flagged conditions</h2>
<ul class="condlist">${conditions}</ul>
<p class="muted" style="font-size:13px">
  Conditions are the secondary head, not the counter. They are what turns "the
  factor dropped" into a claim an adjudicator can read, which is why they are
  attached to the capture rather than derived later.
</p>

<h2>Where this appears</h2>
<div class="note">
  <ul>
    <li>Here, as the annotated capture.</li>
    <li>On <a href="/capture">Capture</a>, linked from the console.</li>
    <li>As an optional exhibit in a report — a client who wants the photograph in
      their package can include it, and it carries its simulated origin with it.</li>
  </ul>
</div>
`;

  return page({
    title: "Demo capture — SiteWireAi",
    path: "/capture",
    heading: "Annotated capture",
    lede: "What a capture looks like once the counting and condition heads have run over it.",
    projectName: "Riverbend Mixed-Use — Tower B",
    dataRegion: "ca-central-1",
    body,
    footer: "SiteWireAi · demo capture · dev only",
  });
}
