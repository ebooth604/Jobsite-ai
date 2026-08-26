/**
 * The two reading surfaces: the library and one photo.
 *
 * Server-rendered from the store on every request. The only client JavaScript in
 * the app is the uploader, which needs a file picker and a canvas to read image
 * dimensions; everything else is links and forms.
 */

import type { ClassifyAllResult } from "./api.js";
import { classifierAvailable, modelName } from "./classify.js";
import { conditionLabel, type Photo, tradeLabel } from "./photo.js";
import { escapeHtml, page, statTiles } from "./ui.js";

/**
 * A photo plus the URL its image is fetched from.
 *
 * Resolved by the caller rather than looked up here, because on AWS that URL is a
 * presigned S3 link — an async call that must not happen inside a render loop.
 */
export type Displayable = Photo & { url: string };

function severityClass(severity: string): string {
  return severity === "critical" ? "critical" : severity === "warning" ? "warning" : "";
}

function conditionChips(photo: Photo): string {
  const conditions = photo.classification?.conditions ?? [];
  if (conditions.length === 0) return "";
  return conditions
    .map(
      (c) =>
        `<span class="chip ${severityClass(c.severity)}">${escapeHtml(
          conditionLabel(c.type),
        )}</span>`,
    )
    .join(" ");
}

/** The banner shown when no API key is configured. */
function keyWarning(): string {
  if (classifierAvailable()) return "";
  return `<div class="note stop" style="margin-bottom:14px">
  <strong>No API key configured.</strong> Classification is unavailable until
  <code>ANTHROPIC_API_KEY</code> is set in the environment and the server is restarted.
  Photos can still be uploaded and browsed.
</div>`;
}

export function libraryView(
  photos: readonly Displayable[],
  storePath: string,
  result: ClassifyAllResult | null,
): string {
  const unclassified = photos.filter((p) => !p.classification).length;
  const withConditions = photos.filter((p) => (p.classification?.conditions.length ?? 0) > 0).length;

  const tiles = statTiles([
    { label: "Photos", value: String(photos.length), note: "everything uploaded" },
    {
      label: "Unclassified",
      value: String(unclassified),
      note: "not yet read by the model",
      ...(unclassified > 0 ? { status: "warning" as const } : {}),
    },
    {
      label: "With conditions",
      value: String(withConditions),
      note: "something is costing time",
      ...(withConditions > 0 ? { status: "warning" as const } : {}),
    },
  ]);

  const resultBanner = result
    ? `<div class="note" style="margin-bottom:14px">
  <strong>Classified ${result.classified}${result.failed > 0 ? `, ${result.failed} failed` : ""}.</strong>
  ${
    result.remaining > 0
      ? `${result.remaining} still unclassified — run it again to keep going.`
      : "Nothing left unclassified."
  }
  ${
    result.errors.length > 0
      ? `<ul style="margin:8px 0 0 18px">${result.errors
          .map((e) => `<li>${escapeHtml(e)}</li>`)
          .join("")}</ul>`
      : ""
  }
</div>`
    : "";

  const classifyAllForm =
    unclassified > 0 && classifierAvailable()
      ? `<form method="post" action="/classify-all" class="panel" style="margin-bottom:14px">
  <button type="submit" class="btn primary">Classify ${Math.min(unclassified, 20)} photo(s)</button>
  <p class="field-hint" style="margin:6px 0 0">
    Sends each unclassified photo to ${escapeHtml(modelName())} and stores what comes back.
    Up to 20 at a time, one after another. This takes a few seconds per photo.
  </p>
</form>`
      : "";

  const cards = photos
    .map((photo) => {
      const c = photo.classification;
      return `
<div class="card">
  <a href="/photo/${escapeHtml(photo.id)}">
    <img src="${escapeHtml(photo.url)}" alt="" loading="lazy">
  </a>
  <div class="card-body">
    <a href="/photo/${escapeHtml(photo.id)}" class="card-title">${escapeHtml(
      c?.scopeDescription || "Unclassified photo",
    )}</a>
    <div class="muted">${escapeHtml(photo.projectRef || "—")} · ${escapeHtml(photo.area || "—")}</div>
    <div style="margin-top:6px">
      ${c ? `<span class="chip">${escapeHtml(tradeLabel(c.trade))}</span>` : '<span class="chip warning">unclassified</span>'}
      ${conditionChips(photo)}
    </div>
  </div>
</div>`;
    })
    .join("");

  const body = `
${keyWarning()}
${resultBanner}
${tiles}
${classifyAllForm}
${
  photos.length === 0
    ? '<div class="empty">No photos yet. <a href="/upload">Upload some</a> to get started.</div>'
    : `<div class="grid">${cards}</div>`
}`;

  return page({
    title: "Library",
    path: "/",
    heading: "Library",
    lede: "Every photo, and what the model made of it. Click one to see the full reading.",
    storePath,
    photoCount: photos.length,
    body,
  });
}

export function photoView(photo: Displayable, storePath: string, photoCount: number): string {
  const c = photo.classification;

  const conditionRows =
    c && c.conditions.length > 0
      ? `<table style="margin-top:8px">
  <thead><tr><th>Condition</th><th>Severity</th><th>Note</th></tr></thead>
  <tbody>${c.conditions
    .map(
      (cond) => `<tr>
    <td>${escapeHtml(conditionLabel(cond.type))}</td>
    <td><span class="chip ${severityClass(cond.severity)}">${escapeHtml(cond.severity)}</span></td>
    <td>${escapeHtml(cond.note || "—")}</td>
  </tr>`,
    )
    .join("")}</tbody>
</table>`
      : '<p class="muted">No conditions flagged.</p>';

  const classificationPanel = c
    ? `<div class="panel">
  <h2 style="margin-top:0">Classification</h2>
  <div class="row">
    <div class="field">
      <label>Trade</label>
      <div>${escapeHtml(tradeLabel(c.trade))}</div>
    </div>
    <div class="field">
      <label>Confidence</label>
      <div>${c.confidence > 0 ? c.confidence.toFixed(2) : "—"}</div>
    </div>
  </div>

  <div class="field">
    <label>Scope</label>
    <div>${escapeHtml(c.scopeDescription || "—")}</div>
  </div>

  <h3>Conditions</h3>
  ${conditionRows}

  <h3>Recommendation</h3>
  <p>${escapeHtml(c.recommendation || "—")}</p>

  <h3>Reading</h3>
  <p>${escapeHtml(c.reading || "—")}</p>

  <p class="field-hint" style="margin-top:14px">
    ${c.confidence > 0 ? "Read by" : "Recorded by"}
    <code>${escapeHtml(c.model || "unknown")}</code>${
      c.classifiedAt ? ` on ${escapeHtml(c.classifiedAt.slice(0, 10))}` : ""
    }. A reading of a photograph, not a measurement — nothing here is a counted quantity.
  </p>
</div>`
    : `<div class="panel">
  <h2 style="margin-top:0">Not classified yet</h2>
  <p class="muted">Run the model over this photo to get a trade, scope, conditions and a
  recommendation.</p>
</div>`;

  const body = `
${keyWarning()}
<p><a href="/">← Library</a></p>

<div class="work">
  <div class="stagewrap">
    <img src="${escapeHtml(photo.url)}" alt="" class="stage">
    <p class="field-hint">
      ${escapeHtml(photo.projectRef || "No project")} · ${escapeHtml(photo.area || "no area")}
      ${photo.capturedAt ? ` · captured ${escapeHtml(photo.capturedAt)}` : ""}
      ${photo.width > 0 ? ` · ${photo.width}×${photo.height}` : ""}
    </p>
    ${photo.notes ? `<p class="field-hint">${escapeHtml(photo.notes)}</p>` : ""}
  </div>

  <div>
    ${classificationPanel}

    <div class="savebar">
      <form method="post" action="/photo/${escapeHtml(photo.id)}/classify" style="display:inline">
        <button type="submit" class="btn primary"${classifierAvailable() ? "" : " disabled"}>
          ${c ? "Re-classify" : "Classify"}
        </button>
      </form>
      <form method="post" action="/photo/${escapeHtml(photo.id)}/delete" style="display:inline">
        <button type="submit" class="btn danger">Delete photo</button>
      </form>
    </div>
  </div>
</div>`;

  return page({
    title: `Photo ${photo.id.slice(0, 8)}`,
    path: "/",
    heading: c?.scopeDescription || "Unclassified photo",
    lede: `${photo.projectRef || "No project"} · ${photo.area || "no area"}`,
    storePath,
    photoCount,
    body,
  });
}

export function uploadView(storePath: string, photoCount: number): string {
  const body = `
${keyWarning()}
<div class="note">
  <strong>Photos are stored and sent exactly as uploaded.</strong> There is no redaction
  step. Each photo is written to <code>${escapeHtml(storePath)}</code> as-is, and the same
  bytes go to ${escapeHtml(modelName())} when it is classified. Don't upload anything you
  would not want leaving this machine.
</div>

<div class="panel" style="margin-top:16px">
  <h2 style="margin-top:0">Batch details</h2>
  <p class="field-hint" style="margin-top:-4px">Applied to every photo in this batch.</p>

  <div class="row">
    <div class="field">
      <label for="project">Project or site</label>
      <input id="project" type="text" placeholder="Kilmer L5">
    </div>
    <div class="field">
      <label for="area">Area</label>
      <input id="area" type="text" placeholder="L5 north corridor">
    </div>
  </div>
  <div class="field">
    <label for="captured-at">Captured on</label>
    <input id="captured-at" type="date">
  </div>
  <div class="field">
    <label for="notes">Notes</label>
    <textarea id="notes" placeholder="Second pass after the ceiling grid went in."></textarea>
  </div>
</div>

<div id="drop" style="margin-top:16px">
  Drop jobsite photos here
  <div><label class="filebtn" for="file">Choose photos</label></div>
  <input id="file" type="file" accept="image/*" multiple>
</div>

<div id="thumbs"></div>

<div class="savebar">
  <button type="button" class="btn primary" id="upload" disabled>Upload</button>
  <label class="check" style="margin-left:8px">
    <input type="checkbox" id="classify-now" checked>
    Classify each photo after upload
  </label>
  <span id="upload-status" class="muted" style="font-size:13px"></span>
</div>

<script type="module" src="/upload.js"></script>`;

  return page({
    title: "Upload",
    path: "/upload",
    heading: "Upload",
    lede: "Add photos, then let the model classify them.",
    storePath,
    photoCount,
    body,
  });
}
