/**
 * The Assist tab: run the two automatic stages, confirm each proposal by hand.
 *
 * The important invariant, and the only one worth remembering while reading this:
 * `pending` and `regions` are separate lists, and nothing crosses from the first
 * to the second without a click. A model can fill `pending` all day; only a human
 * puts anything in `regions`, and only `regions` is ever saved.
 */

interface RegionLabel {
  id: string;
  className: string;
  kind: "box" | "polygon";
  points: [number, number][];
  note: string;
  proposedBy: string;
}

interface SampleSummary {
  id: string;
  imageFile: string;
  width: number;
  height: number;
  regions: RegionLabel[];
}

/** A model's suggestion, waiting on a person. Never saved in this shape. */
interface Pending {
  id: string;
  stage: 1 | 2;
  /** The model that produced it — recorded on the region if it is accepted. */
  proposedBy: string;
  label: string;
  confidence: number;
  kind: "box" | "polygon";
  points: [number, number][];
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element: ${id}`);
  return node as T;
};

const samples = JSON.parse(el<HTMLScriptElement>("samples").textContent ?? "[]") as SampleSummary[];

const stage = el<HTMLCanvasElement>("stage");
const sampleSelect = el<HTMLSelectElement>("sample");
const classSelect = el<HTMLSelectElement>("region-class");
const status = el<HTMLParagraphElement>("assist-status");
const pendingHost = el<HTMLDivElement>("pending");
const regionHost = el<HTMLDivElement>("regions");
const pendingCount = el<HTMLSpanElement>("pending-count");
const regionCount = el<HTMLSpanElement>("region-count");
const saveStatus = el<HTMLSpanElement>("save-status");

let current: SampleSummary | undefined = samples[0];
let regions: RegionLabel[] = [];
let pending: Pending[] = [];
let highlighted: string | null = null;
const image = new Image();

const MAX_WIDTH = 900;

function context(): CanvasRenderingContext2D {
  const ctx = stage.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable in this browser");
  return ctx;
}

/** Stable colour per class, so the same class looks the same in every sample. */
function colourFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
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

  const trace = (points: [number, number][], kind: "box" | "polygon") => {
    ctx.beginPath();
    if (kind === "box") {
      const [a, b] = [points[0], points[1]];
      if (!a || !b) return;
      ctx.rect(
        a[0] * stage.width,
        a[1] * stage.height,
        (b[0] - a[0]) * stage.width,
        (b[1] - a[1]) * stage.height,
      );
    } else {
      points.forEach(([x, y], index) => {
        const px = x * stage.width;
        const py = y * stage.height;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.stroke();
  };

  // Accepted regions: solid. They are on the sample.
  ctx.setLineDash([]);
  for (const region of regions) {
    ctx.strokeStyle = colourFor(region.className);
    trace(region.points, region.kind);
  }

  // Pending: dashed, and thicker when highlighted. Dashed reads as "not yet real"
  // without needing a legend.
  for (const item of pending) {
    ctx.setLineDash(item.id === highlighted ? [] : [6, 4]);
    ctx.lineWidth = item.id === highlighted ? 4 : 2;
    ctx.strokeStyle = item.stage === 2 ? "#35b37e" : "#4c8dff";
    trace(item.points, item.kind);
  }
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
}

function boxOf(item: Pending): { x: number; y: number; w: number; h: number } {
  const xs = item.points.map(([x]) => x);
  const ys = item.points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// ---- rendering the two lists ----------------------------------------------

function renderPending(): void {
  pendingHost.replaceChildren();
  pendingCount.textContent = pending.length ? `· ${pending.length}` : "";

  if (pending.length === 0) {
    const note = document.createElement("p");
    note.className = "assist-empty";
    note.textContent = "Nothing pending. Run a stage to get proposals.";
    pendingHost.appendChild(note);
    return;
  }

  for (const item of pending) {
    const row = document.createElement("div");
    row.className = `pending${item.id === highlighted ? " on" : ""}`;
    row.addEventListener("mouseenter", () => {
      highlighted = item.id;
      draw();
    });

    const head = document.createElement("div");
    head.className = "pending-head";
    const swatch = document.createElement("span");
    swatch.className = "sw";
    swatch.style.background = item.stage === 2 ? "#35b37e" : "#4c8dff";
    head.appendChild(swatch);

    const title = document.createElement("strong");
    title.textContent = `Stage ${item.stage} · ${item.label}`;
    head.appendChild(title);

    const conf = document.createElement("span");
    conf.className = "conf";
    conf.textContent = item.confidence > 0 ? item.confidence.toFixed(2) : "";
    head.appendChild(conf);
    row.appendChild(head);

    const model = document.createElement("div");
    model.className = "muted";
    model.style.fontSize = "12px";
    model.style.marginBottom = "6px";
    model.textContent = `${item.proposedBy} · ${item.kind}, ${item.points.length} pts`;
    row.appendChild(model);

    const acts = document.createElement("div");
    acts.className = "pending-acts";

    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "btn primary";
    accept.textContent = "Accept";
    accept.addEventListener("click", () => acceptPending(item));
    acts.appendChild(accept);

    // Stage 2 is only offered on a box: handing the segmenter a polygon it already
    // produced would ask it to re-segment its own answer.
    if (item.kind === "box") {
      const segment = document.createElement("button");
      segment.type = "button";
      segment.className = "btn";
      segment.textContent = "2 · Segment";
      segment.addEventListener("click", () => void runSegment(item, segment));
      acts.appendChild(segment);
    }

    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "btn danger";
    reject.textContent = "Reject";
    reject.addEventListener("click", () => {
      pending = pending.filter((p) => p.id !== item.id);
      renderPending();
      draw();
    });
    acts.appendChild(reject);

    row.appendChild(acts);
    pendingHost.appendChild(row);
  }
}

function renderRegions(): void {
  regionHost.replaceChildren();
  regionCount.textContent = regions.length ? `· ${regions.length}` : "";

  if (regions.length === 0) {
    const note = document.createElement("p");
    note.className = "assist-empty";
    note.textContent = "No regions accepted yet.";
    regionHost.appendChild(note);
    return;
  }

  regions.forEach((region, index) => {
    const row = document.createElement("div");
    row.className = "pending";

    const head = document.createElement("div");
    head.className = "pending-head";
    const swatch = document.createElement("span");
    swatch.className = "sw";
    swatch.style.background = colourFor(region.className);
    head.appendChild(swatch);
    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${region.className}`;
    head.appendChild(title);
    row.appendChild(head);

    const by = document.createElement("div");
    by.className = "muted";
    by.style.fontSize = "12px";
    by.style.marginBottom = "6px";
    by.textContent = `${region.kind} · ${region.proposedBy || "drawn by hand"}`;
    row.appendChild(by);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn danger";
    remove.style.padding = "4px 10px";
    remove.style.fontSize = "12px";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      regions.splice(index, 1);
      renderRegions();
      draw();
    });
    row.appendChild(remove);

    regionHost.appendChild(row);
  });
}

// ---- the gate --------------------------------------------------------------

/**
 * The only path from a model's output into the sample.
 *
 * Note what it records: `proposedBy` carries the model's name onto the region, so
 * the corpus can always answer "did a person draw this or accept it". Both are
 * legitimate; conflating them is not.
 */
function acceptPending(item: Pending): void {
  regions.push({
    id: crypto.randomUUID(),
    className: classSelect.value,
    kind: item.kind,
    points: item.points,
    note: "",
    proposedBy: item.proposedBy,
  });
  pending = pending.filter((p) => p.id !== item.id);
  renderPending();
  renderRegions();
  draw();
}

// ---- the two automatic stages ---------------------------------------------

/** The stored image as base64, which is what both sidecar endpoints want. */
async function imageBase64(): Promise<string> {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1280 / image.naturalWidth);
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function runDetect(want: "people" | "all", button: HTMLButtonElement): Promise<void> {
  if (!current) return;
  button.disabled = true;
  status.textContent = "Stage 1 · detecting…";

  try {
    const response = await fetch("/api/prelabel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: await imageBase64(), want }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      model?: string;
      proposals?: {
        className: string;
        confidence: number;
        x: number;
        y: number;
        w: number;
        h: number;
      }[];
      unsupportedRequest?: boolean;
      note?: string;
      error?: string;
    };

    if (!response.ok || !result.ok) {
      status.textContent = result.error ?? "The detector could not help with that one.";
      return;
    }
    // "This model has no class for what you asked" is a different answer from
    // "there is nothing there", and a labeller needs to know which they got.
    if (result.unsupportedRequest) {
      status.textContent = result.note || "This model cannot answer that question.";
      return;
    }

    const found = result.proposals ?? [];
    for (const p of found) {
      pending.push({
        id: crypto.randomUUID(),
        stage: 1,
        proposedBy: result.model ?? "detector",
        label: p.className,
        confidence: p.confidence,
        kind: "box",
        points: [
          [p.x, p.y],
          [p.x + p.w, p.y + p.h],
        ],
      });
    }

    status.textContent = found.length
      ? `Stage 1 · ${found.length} proposal(s) from ${result.model}. Confirm each.`
      : "Stage 1 · nothing proposed. That is not the same as nothing being there.";
    renderPending();
    draw();
  } finally {
    button.disabled = false;
  }
}

async function runSegment(item: Pending, button: HTMLButtonElement): Promise<void> {
  if (!current) return;
  button.disabled = true;
  status.textContent = "Stage 2 · segmenting…";

  try {
    const response = await fetch("/api/prelabel/segment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: await imageBase64(), box: boxOf(item) }),
    });
    const result = (await response.json()) as {
      ok?: boolean;
      model?: string;
      polygons?: { points: [number, number][]; score: number }[];
      note?: string;
      error?: string;
    };

    if (!response.ok || !result.ok) {
      status.textContent = result.error ?? "The segmenter could not outline that one.";
      return;
    }

    const polygons = result.polygons ?? [];
    if (polygons.length === 0) {
      status.textContent =
        result.note || "Stage 2 · no usable outline. Keep the box, or reject it.";
      return;
    }

    // The outline replaces the box in the pending list rather than joining it.
    // Two pending items for one object is a way to accidentally accept both.
    pending = pending.filter((p) => p.id !== item.id);
    for (const polygon of polygons) {
      pending.push({
        id: crypto.randomUUID(),
        stage: 2,
        proposedBy: result.model ?? "segmenter",
        label: item.label,
        confidence: polygon.score,
        kind: "polygon",
        points: polygon.points,
      });
    }

    status.textContent = `Stage 2 · outlined by ${result.model}. Confirm it.`;
    renderPending();
    draw();
  } finally {
    button.disabled = false;
  }
}

// ---- sample switching and saving ------------------------------------------

function load(sample: SampleSummary | undefined): void {
  current = sample;
  if (!sample) return;
  regions = sample.regions.map((r) => ({
    ...r,
    points: r.points.map((p) => [p[0], p[1]] as [number, number]),
    proposedBy: r.proposedBy ?? "",
  }));
  pending = [];
  highlighted = null;
  status.textContent = "";
  saveStatus.textContent = "";
  image.src = `/images/${sample.imageFile}`;
  renderPending();
  renderRegions();
}

sampleSelect.addEventListener("change", () => {
  if (pending.length > 0 && !window.confirm("Discard the pending proposals and switch sample?")) {
    sampleSelect.value = current?.id ?? "";
    return;
  }
  load(samples.find((s) => s.id === sampleSelect.value));
});

image.addEventListener("load", draw);

el<HTMLButtonElement>("detect").addEventListener("click", (e) => {
  void runDetect("all", e.currentTarget as HTMLButtonElement);
});
el<HTMLButtonElement>("detect-people").addEventListener("click", (e) => {
  void runDetect("people", e.currentTarget as HTMLButtonElement);
});

el<HTMLButtonElement>("accept-all").addEventListener("click", () => {
  // Deliberately still one decision, just a bulk one — and it only ever applies to
  // what is on screen, which the labeller has been looking at.
  for (const item of [...pending]) acceptPending(item);
});

el<HTMLButtonElement>("reject-all").addEventListener("click", () => {
  pending = [];
  renderPending();
  draw();
});

el<HTMLButtonElement>("save").addEventListener("click", () => {
  if (!current) return;
  saveStatus.textContent = "Saving…";
  void (async () => {
    const response = await fetch(`/api/samples/${current?.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ regions }),
    });
    const body = (await response.json()) as { error?: string };
    saveStatus.textContent = response.ok
      ? `Saved ${regions.length} region(s) at ${new Date().toLocaleTimeString()}`
      : (body.error ?? "Save refused.");
  })();
});

load(current);

/** Marks this file a module, so its names stay its own. */
export {};
