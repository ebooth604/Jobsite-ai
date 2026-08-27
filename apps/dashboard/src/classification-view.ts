/**
 * Adjusting what the classifier made of a capture.
 *
 * The classifier runs the moment a photo is uploaded — see `captures.ts` — so by
 * the time anyone opens this page there is usually already a reading on the row.
 * This is where a person disagrees with it.
 *
 * **A correction is not a lesser kind of reading.** It is written into the same
 * field, read by the same code, and marked `hand-classified` so that "who said
 * this" stays answerable. Confidence goes to zero on a correction, because a
 * person is not a fraction sure and a number in that box would be read as a model
 * score.
 *
 * **No quantity field.** The classifier's schema has none, deliberately, and a
 * hand-entry box on the correction form would be the obvious way to put one back.
 */

import {
  type Classification,
  CONDITION_TYPES,
  type ConditionTag,
  conditionLabel,
  isHandClassified,
  SEVERITIES,
  TRADES,
  tradeLabel,
} from "@sitewireai/classify";
import type { CaptureRow } from "@sitewireai/db";
import { escapeHtml, page } from "./ui.js";

export type CaptureWithImage = CaptureRow & { imageUrl: string };

const SHELL = {
  projectName: "SiteWireAi",
  dataRegion: "ca-central-1",
  footer: "SiteWireAi · classification is a reading of a photograph, never a measurement",
};

function severityClass(severity: string): string {
  return severity === "critical" ? "critical" : severity === "warning" ? "warning" : "";
}

function asClassification(value: unknown): Classification | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Partial<Classification>;
  // A capture stored before the classifier produced this shape has a description
  // rather than a classification. Treated as absent rather than half-rendered.
  if (typeof c.trade !== "string" || typeof c.scopeDescription !== "string") return null;
  return {
    trade: c.trade,
    scopeDescription: c.scopeDescription,
    conditions: Array.isArray(c.conditions) ? (c.conditions as ConditionTag[]) : [],
    recommendation: typeof c.recommendation === "string" ? c.recommendation : "",
    confidence: typeof c.confidence === "number" ? c.confidence : 0,
    reading: typeof c.reading === "string" ? c.reading : "",
    model: typeof c.model === "string" ? c.model : "",
    classifiedAt: typeof c.classifiedAt === "string" ? c.classifiedAt : "",
  };
}

/** The list: every capture this tenant owns, and what the classifier made of it. */
export function classificationsView(captures: readonly CaptureWithImage[], message = ""): string {
  const unclassified = captures.filter((c) => !asClassification(c.classification)).length;

  const note = message
    ? `<div class="banner" style="margin-bottom:14px">${escapeHtml(message)}</div>`
    : "";

  const rows = captures
    .map((capture) => {
      const c = asClassification(capture.classification);
      const chips = (c?.conditions ?? [])
        .map(
          (cond) =>
            `<span class="chip ${severityClass(cond.severity)}">${escapeHtml(
              conditionLabel(cond.type),
            )}</span>`,
        )
        .join(" ");

      return `<tr>
  <td>
    <a href="/captures/${escapeHtml(capture.id)}"><strong>${escapeHtml(
      c?.scopeDescription || "Not classified",
    )}</strong></a>
    <div class="muted" style="font-size:13px">${escapeHtml(capture.area || "—")} ·
      ${escapeHtml(capture.capturedAt || "—")}</div>
  </td>
  <td>${c ? escapeHtml(tradeLabel(c.trade)) : '<span class="chip warning">unclassified</span>'}</td>
  <td>${chips || "—"}</td>
  <td>${
    c
      ? isHandClassified(c)
        ? '<span class="chip">adjusted by hand</span>'
        : `<span class="muted">${escapeHtml(c.model || "model")}</span>`
      : "—"
  }</td>
  <td><a href="/captures/${escapeHtml(capture.id)}">Adjust →</a></td>
</tr>`;
    })
    .join("");

  const body = `
${note}
<p class="lede" style="margin-top:0">
  Every photo is classified as it arrives. Where the reading is wrong, correct it —
  the correction is stored in place of the model's and marked as yours.
  ${unclassified > 0 ? `<strong>${unclassified}</strong> could not be classified and are waiting.` : ""}
</p>

${
  captures.length === 0
    ? `<div class="banner">No captures yet. Add photos from the
       <a href="/capture">capture console</a> and they will be classified on arrival.</div>`
    : `<table>
  <thead><tr><th>Scope</th><th>Trade</th><th>Conditions</th><th>Read by</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
</table>`
}`;

  return page({
    title: "Classifications — SiteWireAi",
    path: "/captures",
    heading: "Classifications",
    lede: "What the classifier made of each photo, and where you disagree.",
    ...SHELL,
    body,
  });
}

function tradeOptions(selected: string): string {
  return [
    `<option value=""${selected ? "" : " selected"}>— not set —</option>`,
    ...TRADES.map(
      (t) =>
        `<option value="${escapeHtml(t.id)}"${t.id === selected ? " selected" : ""}>${escapeHtml(
          t.label,
        )}</option>`,
    ),
  ].join("");
}

function conditionField(
  type: { id: string; label: string },
  existing: ConditionTag | undefined,
): string {
  const severities = SEVERITIES.map(
    (s) => `<option value="${s}"${s === existing?.severity ? " selected" : ""}>${s}</option>`,
  ).join("");

  return `
<div style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px">
  <label style="display:flex;align-items:center;gap:8px">
    <input type="checkbox" name="condition.${escapeHtml(type.id)}"${existing ? " checked" : ""}>
    <strong>${escapeHtml(type.label)}</strong>
  </label>
  <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
    <label style="flex:0 0 130px">Severity
      <select name="severity.${escapeHtml(type.id)}">${severities}</select>
    </label>
    <label style="flex:1;min-width:200px">Note
      <input type="text" name="note.${escapeHtml(type.id)}"
        value="${escapeHtml(existing?.note ?? "")}" placeholder="What you can see, and where.">
    </label>
  </div>
</div>`;
}

/** One capture: the photo, the reading on file, and the form that replaces it. */
/**
 * `query` is carried onto the form action so a POST lands on the same tenant the
 * page was rendered for. In production that is redundant — the org comes from
 * the session — but in dev the `?org=` switcher is the only thing naming the
 * tenant, and a form that drops it posts into whichever org happens to sort
 * first. That looks exactly like a broken save, and cost an afternoon once.
 */
export function classificationView(
  capture: CaptureWithImage,
  message = "",
  query = "",
): string {
  const c = asClassification(capture.classification);
  const byType = new Map((c?.conditions ?? []).map((t) => [t.type, t]));

  const note = message
    ? `<div class="banner" style="margin-bottom:14px">${escapeHtml(message)}</div>`
    : "";

  const provenance = c
    ? `<p class="muted" style="font-size:13px">
        ${isHandClassified(c) ? "Adjusted by hand" : `Read by ${escapeHtml(c.model || "a model")}`}${
          c.classifiedAt ? ` on ${escapeHtml(c.classifiedAt.slice(0, 10))}` : ""
        }${c.confidence > 0 ? ` · confidence ${c.confidence.toFixed(2)}` : ""}
      </p>`
    : `<p class="muted" style="font-size:13px">
        Not classified. The classifier was unavailable when this photo arrived, or it
        declined to read it. Write the reading yourself below.
      </p>`;

  const body = `
${note}
<p><a href="/captures">← All classifications</a></p>

<div style="display:grid;gap:20px;grid-template-columns:minmax(280px,1fr) minmax(320px,1fr)">
  <div>
    ${
      capture.imageUrl
        ? `<img src="${escapeHtml(capture.imageUrl)}" alt=""
             style="width:100%;border-radius:10px;border:1px solid var(--line)">`
        : '<div class="banner">This capture has no image.</div>'
    }
    <p class="muted" style="font-size:13px">
      ${escapeHtml(capture.area || "no area")} ·
      ${escapeHtml(capture.capturedAt || "no date")} ·
      origin <code>${escapeHtml(capture.origin || "—")}</code>
    </p>
    ${provenance}
  </div>

  <form method="post" action="/captures/${escapeHtml(capture.id)}${query ? `?${escapeHtml(query)}` : ""}">
    <h2 style="margin-top:0">Adjust the classification</h2>

    <label>Trade
      <select name="trade">${tradeOptions(c?.trade ?? "")}</select>
    </label>

    <label>Scope
      <input type="text" name="scopeDescription" maxlength="500"
        value="${escapeHtml(c?.scopeDescription ?? "")}"
        placeholder="Branch conduit and boxes, north corridor">
    </label>

    <h3>Conditions</h3>
    <p class="muted" style="font-size:13px;margin-top:-4px">
      Tick what is costing time. Unticked rows are not saved, whatever is typed in them.
    </p>
    ${CONDITION_TYPES.map((t) => conditionField(t, byType.get(t.id))).join("")}

    <label>Recommendation
      <textarea name="recommendation" maxlength="2000" rows="3"
        placeholder="What should happen next, and who needs to do it.">${escapeHtml(
          c?.recommendation ?? "",
        )}</textarea>
    </label>

    <label>Reading
      <textarea name="reading" maxlength="4000" rows="4"
        placeholder="What you can see in the photograph.">${escapeHtml(c?.reading ?? "")}</textarea>
    </label>

    <p style="margin-top:14px">
      <button type="submit">Save adjustment</button>
    </p>
    <p class="muted" style="font-size:13px">
      There is no quantity field, deliberately. A number read off a photograph reads
      like a measurement once it reaches a change order.
    </p>
  </form>
</div>`;

  return page({
    title: `Classification — ${capture.id}`,
    path: "/captures",
    heading: c?.scopeDescription || "Not classified",
    lede: `${capture.area || "no area"} · ${capture.capturedAt || "no date"}`,
    ...SHELL,
    body,
  });
}
