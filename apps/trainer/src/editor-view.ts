/**
 * The manual classification editor.
 *
 * Until now the only way a photo got a reading was to ask the model. That is
 * fine when the model is right and useless when it is not: a person looking at
 * a photograph they took, on a site they know, is the most reliable classifier
 * in the building, and had no way to say so.
 *
 * The form writes to the same field the model writes to, because a reading is a
 * reading — what differs is who made it, which `Classification.model` already
 * records. It is pre-filled from whatever is stored, so correcting the model is
 * the same gesture as classifying from scratch, and the model's own words are
 * there to edit rather than to retype.
 *
 * **No quantity field, here or anywhere.** The classify tool's schema omits it
 * deliberately (see `classify.ts`), and a hand-entry box would be the obvious
 * way to reintroduce exactly what that schema exists to prevent: a number read
 * off a photograph that later reads as a measurement.
 */

import { type Client, clientLabel } from "./clients.js";
import {
  type Classification,
  CONDITION_TYPES,
  type ConditionTag,
  SEVERITIES,
  TRADES,
} from "./photo.js";
import { escapeHtml } from "./ui.js";

function tradeOptions(selected: string): string {
  const blank = `<option value=""${selected ? "" : " selected"}>— not set —</option>`;
  return (
    blank +
    TRADES.map(
      (t) =>
        `<option value="${escapeHtml(t.id)}"${t.id === selected ? " selected" : ""}>${escapeHtml(
          t.label,
        )}</option>`,
    ).join("")
  );
}

function severityOptions(selected: string): string {
  return SEVERITIES.map(
    (s) =>
      `<option value="${s}"${s === selected ? " selected" : ""}>${s}</option>`,
  ).join("");
}

function conditionField(type: { id: string; label: string }, existing: ConditionTag | undefined): string {
  const on = existing !== undefined;
  return `
<div class="field" style="border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px">
  <label class="check" style="display:flex;align-items:center;gap:8px;margin:0">
    <input type="checkbox" name="condition.${escapeHtml(type.id)}"${on ? " checked" : ""}>
    <strong>${escapeHtml(type.label)}</strong>
  </label>
  <div class="row" style="margin-top:8px">
    <div class="field" style="margin:0">
      <label for="sev-${escapeHtml(type.id)}">Severity</label>
      <select id="sev-${escapeHtml(type.id)}" name="severity.${escapeHtml(type.id)}">
        ${severityOptions(existing?.severity ?? "warning")}
      </select>
    </div>
    <div class="field" style="margin:0;flex:2">
      <label for="note-${escapeHtml(type.id)}">Note</label>
      <input id="note-${escapeHtml(type.id)}" type="text" name="note.${escapeHtml(type.id)}"
        value="${escapeHtml(existing?.note ?? "")}" placeholder="What you can see, and where.">
    </div>
  </div>
</div>`;
}

/**
 * Files the photo against a client.
 *
 * Its own form rather than a field on the classification form: filing a photo
 * and reading it are different jobs, done at different times, and a person who
 * has just corrected a trade should not have to think about the client dropdown
 * before their edit will save.
 */
export function clientForm(photoId: string, clientRef: string, clients: readonly Client[]): string {
  const options =
    `<option value=""${clientRef ? "" : " selected"}>— unassigned —</option>` +
    clients
      .map(
        (c) =>
          `<option value="${escapeHtml(c.id)}"${c.id === clientRef ? " selected" : ""}>${escapeHtml(
            c.name,
          )}</option>`,
      )
      .join("");

  // A ref that resolves to nothing keeps a row of its own, so the photo does not
  // silently look unassigned when its client was deleted.
  const orphan =
    clientRef && !clients.some((c) => c.id === clientRef)
      ? `<option value="${escapeHtml(clientRef)}" selected>${escapeHtml(clientRef)} (not in the client list)</option>`
      : "";

  return `<form method="post" action="/photo/${escapeHtml(photoId)}/client" class="panel">
  <h2 style="margin-top:0">Client</h2>
  <div class="field">
    <label for="clientRef">Filed against</label>
    <select id="clientRef" name="clientRef">${options}${orphan}</select>
    <p class="field-hint">
      Currently ${escapeHtml(clientLabel(clients, clientRef))}. Clients come from the
      product's tenant store — add one in the dashboard's admin console.
    </p>
  </div>
  <button type="submit" class="btn">Save client</button>
</form>`;
}

export function editorForm(photoId: string, current: Classification | null): string {
  const byType = new Map((current?.conditions ?? []).map((c) => [c.type, c]));

  return `<form method="post" action="/photo/${escapeHtml(photoId)}/save" class="panel">
  <h2 style="margin-top:0">Classify by hand</h2>
  <p class="field-hint" style="margin-top:-4px">
    ${
      current
        ? "Pre-filled from the reading on file. Saving replaces it and records you as the author."
        : "Write the reading yourself. Saving records you as the author, not a model."
    }
  </p>

  <div class="field">
    <label for="trade">Trade</label>
    <select id="trade" name="trade">${tradeOptions(current?.trade ?? "")}</select>
  </div>

  <div class="field">
    <label for="scopeDescription">Scope</label>
    <input id="scopeDescription" type="text" name="scopeDescription" maxlength="500"
      value="${escapeHtml(current?.scopeDescription ?? "")}"
      placeholder="Branch conduit and boxes, north corridor">
  </div>

  <h3>Conditions</h3>
  <p class="field-hint" style="margin-top:-4px">
    Tick what is costing time. Unticked rows are not saved, whatever is typed in them.
  </p>
  ${CONDITION_TYPES.map((t) => conditionField(t, byType.get(t.id))).join("")}

  <div class="field">
    <label for="recommendation">Recommendation</label>
    <textarea id="recommendation" name="recommendation" maxlength="2000"
      placeholder="What should happen next, and who needs to do it.">${escapeHtml(
        current?.recommendation ?? "",
      )}</textarea>
  </div>

  <div class="field">
    <label for="reading">Reading</label>
    <textarea id="reading" name="reading" maxlength="4000"
      placeholder="What you can see in the photograph.">${escapeHtml(current?.reading ?? "")}</textarea>
  </div>

  <div class="savebar" style="margin-top:4px">
    <button type="submit" class="btn primary">Save classification</button>
    <span class="field-hint" style="margin-left:10px">
      No quantity field, deliberately — a number read off a photograph ends up in a
      change order as if it had been measured.
    </span>
  </div>
</form>`;
}
