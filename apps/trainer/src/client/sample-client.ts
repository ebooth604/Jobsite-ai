/**
 * The sample editor: draw regions on the photo, record the measured truth, and
 * say what may be done with the result.
 *
 * Two things this file deliberately does not do. It does not decide whether a
 * sample is ready — the server computes that and hands the list back with every
 * save, so there is one implementation of the rules rather than one in the browser
 * that drifts. And it does not filter the split control; the page arrives with the
 * ineligible options already disabled and their reasons attached, and the server
 * refuses them again on write.
 */

interface RegionLabel {
  id: string;
  className: string;
  kind: "box" | "polygon";
  points: [number, number][];
  note: string;
}

interface ConditionTag {
  type: string;
  severity: "info" | "warning" | "critical";
  note: string;
}

interface Sample {
  id: string;
  imageFile: string;
  width: number;
  height: number;
  groundTruth: {
    trade: string;
    scopeDescription: string;
    unitOfMeasure: string;
    quantity: number | null;
    abstained: boolean;
    method: string;
    measuredBy: string;
    measuredAt: string;
    uncertaintyPct: number;
    notes: string;
  };
  conditions: ConditionTag[];
  regions: RegionLabel[];
  hardCases: string[];
  split: string;
  status: string;
}

interface Taxonomy {
  trades: { id: string; label: string; units: string[] }[];
  regionClasses: { id: string; label: string; trade: string | null }[];
  conditionTypes: { id: string; label: string }[];
  hardCases: { id: string; label: string }[];
  measurementMethods: { id: string; label: string; note: string }[];
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element: ${id}`);
  return node as T;
};

function readJson<T>(id: string): T {
  return JSON.parse(el<HTMLScriptElement>(id).textContent ?? "{}") as T;
}

const sample = readJson<Sample>("sample");
const taxonomy = readJson<Taxonomy>("taxonomy");
const neighbours = readJson<{ prev: string | null; next: string | null }>("neighbours");

const regions: RegionLabel[] = sample.regions.map((r) => ({
  ...r,
  points: r.points.map((p) => [p[0], p[1]] as [number, number]),
}));
const conditions: ConditionTag[] = [...sample.conditions];
const hardCases = new Set(sample.hardCases);

const stage = el<HTMLCanvasElement>("stage");
const regionList = el<HTMLDivElement>("regions");
const classSelect = el<HTMLSelectElement>("region-class");
const finishPoly = el<HTMLButtonElement>("finish-poly");
const gate = el<HTMLParagraphElement>("gate");
const saveStatus = el<HTMLSpanElement>("save-status");
const tradeSelect = el<HTMLSelectElement>("trade");
const unitSelect = el<HTMLSelectElement>("unit");
const abstain = el<HTMLInputElement>("abstain");
const quantity = el<HTMLInputElement>("quantity");
const uncertainty = el<HTMLInputElement>("uncertainty");
const methodSelect = el<HTMLSelectElement>("method");
const methodNote = el<HTMLParagraphElement>("method-note");

let tool: "box" | "polygon" = "box";
let pending: [number, number][] = [];
let dragStart: [number, number] | null = null;

// ---- image ----------------------------------------------------------------

const image = new Image();
image.src = `/images/${sample.imageFile}`;

const MAX_WIDTH = 940;

function context(): CanvasRenderingContext2D {
  const ctx = stage.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable in this browser");
  return ctx;
}

/** A stable colour per class. Hue from the name so the same class is the same
 *  colour in every sample and across sessions, with no palette to maintain. */
function colourFor(className: string): string {
  let hash = 0;
  for (let i = 0; i < className.length; i++) hash = (hash * 31 + className.charCodeAt(i)) % 360;
  return `hsl(${hash} 80% 62%)`;
}

function draw(): void {
  if (!image.complete || image.naturalWidth === 0) return;
  const scale = Math.min(1, MAX_WIDTH / image.naturalWidth);
  stage.width = Math.round(image.naturalWidth * scale);
  stage.height = Math.round(image.naturalHeight * scale);

  const ctx = context();
  ctx.drawImage(image, 0, 0, stage.width, stage.height);
  ctx.lineWidth = 2;
  ctx.font = "12px ui-sans-serif, system-ui, sans-serif";

  for (const region of regions) {
    const colour = colourFor(region.className);
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;

    if (region.kind === "box") {
      const [a, b] = [region.points[0], region.points[1]];
      if (!a || !b) continue;
      const x = a[0] * stage.width;
      const y = a[1] * stage.height;
      ctx.strokeRect(x, y, (b[0] - a[0]) * stage.width, (b[1] - a[1]) * stage.height);
      ctx.fillText(labelFor(region.className), x + 3, Math.max(12, y - 4));
    } else {
      ctx.beginPath();
      region.points.forEach(([px, py], index) => {
        const x = px * stage.width;
        const y = py * stage.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      const first = region.points[0];
      if (first)
        ctx.fillText(
          labelFor(region.className),
          first[0] * stage.width + 3,
          first[1] * stage.height - 4,
        );
    }
  }

  if (pending.length > 0) {
    ctx.strokeStyle = "#e8ecf3";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    pending.forEach(([px, py], index) => {
      const x = px * stage.width;
      const y = py * stage.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function labelFor(className: string): string {
  return taxonomy.regionClasses.find((c) => c.id === className)?.label ?? className;
}

image.addEventListener("load", () => {
  draw();
  renderRegionList();
});

// ---- region drawing -------------------------------------------------------

function pointOf(event: PointerEvent): [number, number] {
  const rect = stage.getBoundingClientRect();
  return [
    Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  ];
}

stage.addEventListener("pointerdown", (event) => {
  if (tool === "polygon") {
    pending.push(pointOf(event));
    finishPoly.hidden = pending.length < 3;
    draw();
    return;
  }
  stage.setPointerCapture(event.pointerId);
  dragStart = pointOf(event);
});

stage.addEventListener("pointermove", (event) => {
  if (tool !== "box" || !dragStart) return;
  const now = pointOf(event);
  draw();
  const ctx = context();
  ctx.strokeStyle = colourFor(classSelect.value);
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(
    dragStart[0] * stage.width,
    dragStart[1] * stage.height,
    (now[0] - dragStart[0]) * stage.width,
    (now[1] - dragStart[1]) * stage.height,
  );
  ctx.setLineDash([]);
});

stage.addEventListener("pointerup", (event) => {
  if (tool !== "box" || !dragStart) return;
  const end = pointOf(event);
  const topLeft: [number, number] = [
    Math.min(dragStart[0], end[0]),
    Math.min(dragStart[1], end[1]),
  ];
  const bottomRight: [number, number] = [
    Math.max(dragStart[0], end[0]),
    Math.max(dragStart[1], end[1]),
  ];
  dragStart = null;

  // Zero-area annotations are stray clicks, and a training set full of them is
  // worse than one with none.
  if (bottomRight[0] - topLeft[0] < 0.004 || bottomRight[1] - topLeft[1] < 0.004) {
    draw();
    return;
  }

  regions.push({
    id: crypto.randomUUID(),
    className: classSelect.value,
    kind: "box",
    points: [topLeft, bottomRight],
    note: "",
  });
  renderRegionList();
  draw();
});

finishPoly.addEventListener("click", () => {
  if (pending.length >= 3) {
    regions.push({
      id: crypto.randomUUID(),
      className: classSelect.value,
      kind: "polygon",
      points: [...pending],
      note: "",
    });
  }
  pending = [];
  finishPoly.hidden = true;
  renderRegionList();
  draw();
});

el<HTMLButtonElement>("undo-region").addEventListener("click", () => {
  if (pending.length > 0) {
    pending.pop();
    finishPoly.hidden = pending.length < 3;
  } else {
    regions.pop();
    renderRegionList();
  }
  draw();
});

for (const button of [el<HTMLButtonElement>("tool-box"), el<HTMLButtonElement>("tool-poly")]) {
  button.addEventListener("click", () => {
    tool = button.dataset.tool === "polygon" ? "polygon" : "box";
    pending = [];
    finishPoly.hidden = true;
    el<HTMLButtonElement>("tool-box").classList.toggle("on", tool === "box");
    el<HTMLButtonElement>("tool-poly").classList.toggle("on", tool === "polygon");
    draw();
  });
}

function renderRegionList(): void {
  regionList.replaceChildren();
  if (regions.length === 0) {
    const note = document.createElement("p");
    note.className = "muted";
    note.style.fontSize = "13px";
    note.textContent =
      "No regions. Quantity can be learned from a count alone, but regions are what make an estimate explainable to a foreman who disagrees with it.";
    regionList.appendChild(note);
    return;
  }

  regions.forEach((region, index) => {
    const row = document.createElement("div");
    row.className = "regionrow";

    const swatch = document.createElement("span");
    swatch.className = "sw";
    swatch.style.background = colourFor(region.className);
    row.appendChild(swatch);

    const text = document.createElement("span");
    text.textContent = `${index + 1}. ${labelFor(region.className)} (${region.kind})`;
    row.appendChild(text);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn danger";
    remove.style.padding = "2px 8px";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      regions.splice(index, 1);
      renderRegionList();
      draw();
    });
    row.appendChild(remove);

    regionList.appendChild(row);
  });
}

// ---- vocabulary controls --------------------------------------------------

function renderUnits(): void {
  const trade = taxonomy.trades.find((t) => t.id === tradeSelect.value);
  const units = trade?.units ?? [];
  unitSelect.replaceChildren();
  for (const unit of units) {
    const option = document.createElement("option");
    option.value = unit;
    option.textContent = unit;
    if (unit === sample.groundTruth.unitOfMeasure) option.selected = true;
    unitSelect.appendChild(option);
  }
  // A unit recorded before the taxonomy moved must not vanish silently.
  if (sample.groundTruth.unitOfMeasure && !units.includes(sample.groundTruth.unitOfMeasure)) {
    const option = document.createElement("option");
    option.value = sample.groundTruth.unitOfMeasure;
    option.textContent = `${sample.groundTruth.unitOfMeasure} (not in taxonomy)`;
    option.selected = true;
    unitSelect.appendChild(option);
  }
}

tradeSelect.addEventListener("change", () => {
  renderUnits();
  renderRegionHints();
});

/** Region classes belonging to another trade stay selectable — a photo of an
 *  electrical wall may legitimately contain a stud — but the trade's own classes
 *  come first, because that is what is being counted. */
function renderRegionHints(): void {
  const trade = tradeSelect.value;
  const ordered = [...taxonomy.regionClasses].sort((a, b) => {
    const score = (c: { trade: string | null }) =>
      c.trade === trade ? 0 : c.trade === null ? 1 : 2;
    return score(a) - score(b);
  });
  const current = classSelect.value;
  classSelect.replaceChildren();
  for (const c of ordered) {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.trade === trade ? `${c.label} ★` : c.label;
    if (c.id === current) option.selected = true;
    classSelect.appendChild(option);
  }
}

function renderMethodNote(): void {
  methodNote.textContent =
    taxonomy.measurementMethods.find((m) => m.id === methodSelect.value)?.note ?? "";
}

methodSelect.addEventListener("change", renderMethodNote);

abstain.addEventListener("change", () => {
  quantity.disabled = abstain.checked;
  if (abstain.checked) quantity.value = "";
});

// ---- tags -----------------------------------------------------------------

function renderConditions(): void {
  const host = el<HTMLDivElement>("conditions");
  host.replaceChildren();

  for (const type of taxonomy.conditionTypes) {
    const existing = conditions.find((c) => c.type === type.id);
    const tag = document.createElement("span");
    tag.className = `tag${existing ? " on" : ""}`;

    const label = document.createElement("span");
    label.textContent = type.label;
    label.style.cursor = "pointer";
    label.addEventListener("click", () => {
      const index = conditions.findIndex((c) => c.type === type.id);
      if (index >= 0) conditions.splice(index, 1);
      else conditions.push({ type: type.id, severity: "warning", note: "" });
      renderConditions();
    });
    tag.appendChild(label);

    if (existing) {
      const severity = document.createElement("select");
      for (const level of ["info", "warning", "critical"] as const) {
        const option = document.createElement("option");
        option.value = level;
        option.textContent = level;
        if (existing.severity === level) option.selected = true;
        severity.appendChild(option);
      }
      severity.addEventListener("change", () => {
        existing.severity = severity.value as ConditionTag["severity"];
      });
      tag.appendChild(severity);
    }

    host.appendChild(tag);
  }
}

function renderHardCases(): void {
  const host = el<HTMLDivElement>("hard-cases");
  host.replaceChildren();
  for (const hard of taxonomy.hardCases) {
    const tag = document.createElement("button");
    tag.type = "button";
    tag.className = `tag${hardCases.has(hard.id) ? " on" : ""}`;
    tag.textContent = hard.label;
    tag.addEventListener("click", () => {
      if (hardCases.has(hard.id)) hardCases.delete(hard.id);
      else hardCases.add(hard.id);
      renderHardCases();
    });
    host.appendChild(tag);
  }
}

// ---- suggested classification ----------------------------------------------

interface ClassifySuggestion {
  trade: string;
  scopeDescription: string;
  conditions: ConditionTag[];
  hardCases: string[];
}

interface ClassifyResponse {
  error?: string;
  drafted?: boolean;
  message?: string;
  model?: string;
  confidence?: number;
  reading?: string;
  suggestion?: ClassifySuggestion;
}

const suggestButton = el<HTMLButtonElement>("suggest-classification");
const suggestStatus = el<HTMLSpanElement>("suggest-status");
const suggestReading = el<HTMLDivElement>("suggest-reading");

suggestButton.addEventListener("click", async () => {
  suggestButton.disabled = true;
  suggestStatus.textContent = "Asking the model…";
  suggestReading.hidden = true;

  try {
    const response = await fetch(`/api/classify/${sample.id}`, { method: "POST" });
    const body = (await response.json()) as ClassifyResponse;

    if (!response.ok) {
      suggestStatus.textContent = body.error ?? "Suggestion failed.";
      return;
    }
    if (!body.drafted || !body.suggestion) {
      suggestStatus.textContent = body.message ?? "The model had nothing to suggest.";
      return;
    }

    const { suggestion } = body;
    if (suggestion.trade) {
      tradeSelect.value = suggestion.trade;
      renderUnits();
      renderRegionHints();
    }
    if (suggestion.scopeDescription) {
      el<HTMLInputElement>("scope").value = suggestion.scopeDescription;
    }
    // Only add types the labeller hasn't already tagged — a suggestion should
    // never overwrite tagging someone is already partway through doing by hand.
    for (const suggested of suggestion.conditions) {
      if (!conditions.some((c) => c.type === suggested.type)) conditions.push(suggested);
    }
    renderConditions();
    for (const id of suggestion.hardCases) hardCases.add(id);
    renderHardCases();

    const confidence = typeof body.confidence === "number" ? body.confidence.toFixed(2) : "?";
    suggestStatus.textContent = "Suggestion applied — review before saving.";
    suggestReading.hidden = false;
    suggestReading.textContent = `Model (${body.model ?? "?"}, confidence ${confidence}): ${
      body.reading || "no comment"
    }`;
  } catch {
    suggestStatus.textContent = "Suggestion failed — the trainer server may be unreachable.";
  } finally {
    suggestButton.disabled = false;
  }
});

// ---- save -----------------------------------------------------------------

function payload(): unknown {
  const value = Number.parseFloat(quantity.value);
  return {
    projectRef: el<HTMLInputElement>("project").value,
    area: el<HTMLInputElement>("area").value,
    capturedAt: el<HTMLInputElement>("captured-at").value,
    captureNotes: el<HTMLTextAreaElement>("capture-notes").value,
    groundTruth: {
      trade: tradeSelect.value,
      scopeDescription: el<HTMLInputElement>("scope").value,
      unitOfMeasure: unitSelect.value,
      quantity: abstain.checked || Number.isNaN(value) ? null : value,
      abstained: abstain.checked,
      method: methodSelect.value,
      measuredBy: el<HTMLInputElement>("measured-by").value,
      measuredAt: el<HTMLInputElement>("measured-at").value,
      uncertaintyPct: Number.parseFloat(uncertainty.value) || 0,
      notes: el<HTMLTextAreaElement>("gt-notes").value,
    },
    conditions,
    regions,
    hardCases: [...hardCases],
    split: el<HTMLSelectElement>("split").value,
    status: el<HTMLSelectElement>("status").value,
    labelledBy: el<HTMLInputElement>("labelled-by").value,
    reviewedBy: el<HTMLInputElement>("reviewed-by").value,
    reviewNote: el<HTMLTextAreaElement>("review-note").value,
  };
}

async function save(): Promise<boolean> {
  saveStatus.textContent = "Saving…";
  const response = await fetch(`/api/samples/${sample.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload()),
  });
  const body = (await response.json()) as {
    error?: string;
    readiness?: { ready: boolean; missing: string[] };
  };

  if (!response.ok) {
    saveStatus.textContent = "";
    // A refusal here is a rule, not a glitch, so it is shown where the rules are.
    gate.className = "gate todo";
    gate.innerHTML = `<strong>Refused.</strong> ${body.error ?? response.statusText}`;
    return false;
  }

  saveStatus.textContent = `Saved ${new Date().toLocaleTimeString()}`;
  renderGate(body.readiness ?? { ready: true, missing: [] });
  return true;
}

function renderGate(readiness: { ready: boolean; missing: string[] }): void {
  gate.className = `gate ${readiness.ready ? "ok" : "todo"}`;
  gate.innerHTML = readiness.ready
    ? "Fully labelled. Mark it reviewed once a second person has checked the number."
    : `Still outstanding:<ul>${readiness.missing.map((m) => `<li>${m}</li>`).join("")}</ul>`;
}

el<HTMLButtonElement>("save").addEventListener("click", () => {
  void save();
});

el<HTMLButtonElement>("save-next").addEventListener("click", () => {
  void save().then((ok) => {
    if (ok && neighbours.next) window.location.href = `/sample/${neighbours.next}`;
    else if (ok) saveStatus.textContent = "Saved — this is the last sample.";
  });
});

el<HTMLButtonElement>("delete").addEventListener("click", () => {
  if (!window.confirm("Delete this sample and its photo? This cannot be undone.")) return;
  void fetch(`/api/samples/${sample.id}`, { method: "DELETE" }).then(() => {
    window.location.href = "/";
  });
});

// Ctrl/Cmd+S is what everyone's hands do in a labelling tool anyway.
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void save();
  }
});

// ---- boot -----------------------------------------------------------------

renderUnits();
renderRegionHints();
renderMethodNote();
renderConditions();
renderHardCases();
renderRegionList();
quantity.disabled = abstain.checked;
draw();

/** Marks this file a module, so its names stay its own. */
export {};
