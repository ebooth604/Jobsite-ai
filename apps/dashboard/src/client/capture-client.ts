/**
 * Capture console — runs entirely in the browser.
 *
 * Nothing here uploads. Files are read with the File API, drawn to a canvas, and
 * redacted in place; no byte leaves the tab. That is not a shortcut for the demo,
 * it is the shape the real capture path has to take: the mobile app redacts faces
 * on-device *before* anything is sent, and the ingestion service re-checks
 * server-side regardless (technical plan §3, §8).
 *
 * Two things this UI is careful not to overclaim:
 *
 *   - Client-side redaction is the FIRST of two passes, never the only one. The
 *     ingestion service re-checks every capture, because a client-side bug is not
 *     an acceptable failure mode for a promise made in a contract.
 *   - `origin` is *proposed* here and set authoritatively at ingest. It is never
 *     inferred later — that is what keeps the simulated-capture leak assertion
 *     enforceable (§5.4d, §11).
 */

interface ScopeItemLite {
  id: string;
  trade: string;
  description: string;
  unitOfMeasure: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Shot {
  id: string;
  name: string;
  bitmap: ImageBitmap;
  /** Redaction regions in image coordinates, so they survive zoom and resize. */
  redactions: Rect[];
  rotation: 0 | 90 | 180 | 270;
  noPeople: boolean;
}

interface QueuedCapture {
  captureId: string;
  fileName: string;
  scopeItemId: string;
  area: string;
  capturedAt: string;
  proposedOrigin: string;
  estimatedQuantity: number | null;
  abstained: boolean;
  redactionCount: number;
  faceBlurStatus: "blurred" | "declared_no_people";
  dataUrl: string;
}

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};

const scopeItems: ScopeItemLite[] = JSON.parse(
  document.getElementById("scope-items")?.textContent ?? "[]",
);

const shots: Shot[] = [];
const queue: QueuedCapture[] = [];
let activeId: string | null = null;

/** Mosaic rather than a soft blur: averaging whole blocks is not reversible by
 *  sharpening the way a gaussian often is. */
const MOSAIC_BLOCK = 14;

const canvas = $<HTMLCanvasElement>("#editor");

/** Throws rather than returning null, so the binding is non-null inside closures. */
function context2d(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = target.getContext("2d");
  if (!c) throw new Error("canvas 2d context unavailable");
  return c;
}

const ctx = context2d(canvas);

const activeShot = (): Shot | null => shots.find((s) => s.id === activeId) ?? null;

/** Source dimensions after rotation. */
function shotSize(shot: Shot): { w: number; h: number } {
  const swap = shot.rotation === 90 || shot.rotation === 270;
  return {
    w: swap ? shot.bitmap.height : shot.bitmap.width,
    h: swap ? shot.bitmap.width : shot.bitmap.height,
  };
}

/** Full-resolution render: the image, rotated, with every redaction burned in. */
function renderFull(shot: Shot): HTMLCanvasElement {
  const { w, h } = shotSize(shot);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const c = context2d(out);

  c.save();
  c.translate(w / 2, h / 2);
  c.rotate((shot.rotation * Math.PI) / 180);
  c.drawImage(shot.bitmap, -shot.bitmap.width / 2, -shot.bitmap.height / 2);
  c.restore();

  for (const r of shot.redactions) {
    mosaic(c, r);
  }
  return out;
}

/** Downsample the region to blocks and scale it back with smoothing off. */
function mosaic(c: CanvasRenderingContext2D, r: Rect): void {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  const w = Math.max(1, Math.round(r.w));
  const h = Math.max(1, Math.round(r.h));

  const smallW = Math.max(1, Math.floor(w / MOSAIC_BLOCK));
  const smallH = Math.max(1, Math.floor(h / MOSAIC_BLOCK));

  const tmp = document.createElement("canvas");
  tmp.width = smallW;
  tmp.height = smallH;
  const t = tmp.getContext("2d");
  if (!t) return;

  t.imageSmoothingEnabled = true;
  t.drawImage(c.canvas, x, y, w, h, 0, 0, smallW, smallH);

  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(tmp, 0, 0, smallW, smallH, x, y, w, h);
  c.restore();
}

let viewScale = 1;

function draw(): void {
  const shot = activeShot();
  const stage = $<HTMLDivElement>("#stage");

  if (!shot) {
    canvas.width = 0;
    canvas.height = 0;
    $("#empty-state").hidden = false;
    stage.hidden = true;
    return;
  }

  $("#empty-state").hidden = true;
  stage.hidden = false;

  const full = renderFull(shot);
  const maxW = Math.max(240, stage.clientWidth - 2);
  viewScale = Math.min(1, maxW / full.width);

  canvas.width = Math.round(full.width * viewScale);
  canvas.height = Math.round(full.height * viewScale);
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);

  // Outline each redaction so it is visibly a deliberate act, not an artefact.
  ctx.save();
  ctx.strokeStyle = "#2a78d6";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  for (const r of shot.redactions) {
    ctx.strokeRect(r.x * viewScale, r.y * viewScale, r.w * viewScale, r.h * viewScale);
  }
  ctx.restore();

  updateGate();
}

/** Pointer position in image coordinates. */
function toImage(ev: PointerEvent): { x: number; y: number } {
  const box = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - box.left) / viewScale,
    y: (ev.clientY - box.top) / viewScale,
  };
}

let dragStart: { x: number; y: number } | null = null;

canvas.addEventListener("pointerdown", (ev) => {
  if (!activeShot()) return;
  canvas.setPointerCapture(ev.pointerId);
  dragStart = toImage(ev);
});

canvas.addEventListener("pointermove", (ev) => {
  if (!dragStart) return;
  const now = toImage(ev);
  draw();
  ctx.save();
  ctx.strokeStyle = "#2a78d6";
  ctx.fillStyle = "rgba(42,120,214,0.18)";
  ctx.lineWidth = 2;
  const x = Math.min(dragStart.x, now.x) * viewScale;
  const y = Math.min(dragStart.y, now.y) * viewScale;
  const w = Math.abs(now.x - dragStart.x) * viewScale;
  const h = Math.abs(now.y - dragStart.y) * viewScale;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
});

canvas.addEventListener("pointerup", (ev) => {
  const shot = activeShot();
  if (!dragStart || !shot) return;
  const end = toImage(ev);
  const rect: Rect = {
    x: Math.min(dragStart.x, end.x),
    y: Math.min(dragStart.y, end.y),
    w: Math.abs(end.x - dragStart.x),
    h: Math.abs(end.y - dragStart.y),
  };
  dragStart = null;
  // Ignore stray taps; a redaction smaller than a block does nothing anyway.
  if (rect.w >= MOSAIC_BLOCK && rect.h >= MOSAIC_BLOCK) {
    shot.redactions.push(rect);
    // The strip is how an operator sees which photos still need work, so its
    // badge has to move the moment a redaction lands.
    renderThumbs();
  }
  draw();
});

async function addFiles(files: FileList | null): Promise<void> {
  if (!files) return;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    const bitmap = await createImageBitmap(file);
    const shot: Shot = {
      id: `shot-${Date.now()}-${shots.length}`,
      name: file.name,
      bitmap,
      redactions: [],
      rotation: 0,
      noPeople: false,
    };
    shots.push(shot);
    activeId = shot.id;
  }
  renderThumbs();
  draw();
}

function renderThumbs(): void {
  const strip = $<HTMLDivElement>("#thumbs");
  strip.innerHTML = "";
  for (const shot of shots) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `thumb${shot.id === activeId ? " active" : ""}`;
    btn.title = shot.name;

    const c = document.createElement("canvas");
    const scale = Math.min(1, 96 / Math.max(shot.bitmap.width, shot.bitmap.height));
    c.width = Math.max(1, Math.round(shot.bitmap.width * scale));
    c.height = Math.max(1, Math.round(shot.bitmap.height * scale));
    const tc = c.getContext("2d");
    if (tc) tc.drawImage(shot.bitmap, 0, 0, c.width, c.height);

    const tag = document.createElement("span");
    const done = shot.redactions.length > 0 || shot.noPeople;
    tag.className = `thumb-tag ${done ? "ok" : "todo"}`;
    tag.textContent = shot.redactions.length > 0 ? `${shot.redactions.length}` : done ? "—" : "!";

    btn.append(c, tag);
    btn.addEventListener("click", () => {
      activeId = shot.id;
      renderThumbs();
      draw();
    });
    strip.append(btn);
  }
}

/**
 * The gate. A capture cannot be queued until faces have been dealt with — either
 * regions were redacted, or the operator explicitly declared no people in frame.
 * Silence is not consent: an untouched photo is never treated as safe.
 */
function updateGate(): void {
  const shot = activeShot();
  const queueBtn = $<HTMLButtonElement>("#queue");
  const status = $<HTMLParagraphElement>("#gate-status");
  const noPeople = $<HTMLInputElement>("#no-people");

  if (!shot) {
    queueBtn.disabled = true;
    status.textContent = "";
    return;
  }

  noPeople.checked = shot.noPeople;
  const redacted = shot.redactions.length;
  const ready = redacted > 0 || shot.noPeople;
  queueBtn.disabled = !ready;

  if (redacted > 0) {
    status.className = "gate ok";
    status.textContent = `${redacted} region(s) redacted on this capture. The ingestion service re-checks server-side regardless.`;
  } else if (shot.noPeople) {
    status.className = "gate ok";
    status.textContent =
      "Declared no people in frame. Recorded as a declaration, and still re-checked at ingest.";
  } else {
    status.className = "gate todo";
    status.textContent =
      "Drag on the image to redact faces, or declare there are no people in frame. A capture cannot be queued until one of those is true.";
  }
}

function queueActive(): void {
  const shot = activeShot();
  if (!shot) return;

  const full = renderFull(shot);
  const abstained = $<HTMLInputElement>("#abstain").checked;
  const qtyRaw = $<HTMLInputElement>("#quantity").value;

  const entry: QueuedCapture = {
    captureId: `cap-${queue.length + 1}`,
    fileName: shot.name,
    scopeItemId: $<HTMLSelectElement>("#scope").value,
    area: $<HTMLInputElement>("#area").value || "(unspecified)",
    capturedAt: $<HTMLInputElement>("#captured-at").value || new Date().toISOString().slice(0, 10),
    proposedOrigin: $<HTMLSelectElement>("#origin").value,
    estimatedQuantity: abstained || qtyRaw === "" ? null : Number(qtyRaw),
    abstained,
    redactionCount: shot.redactions.length,
    faceBlurStatus: shot.redactions.length > 0 ? "blurred" : "declared_no_people",
    // Only the redacted render is ever produced. The original bitmap stays in
    // memory for editing and is never exported or written anywhere.
    dataUrl: full.toDataURL("image/jpeg", 0.85),
  };

  queue.push(entry);
  renderQueue();
}

function renderQueue(): void {
  const list = $<HTMLDivElement>("#queue-list");
  const count = $<HTMLSpanElement>("#queue-count");
  count.textContent = String(queue.length);

  if (queue.length === 0) {
    list.innerHTML = '<div class="empty">No captures prepared yet.</div>';
    return;
  }

  list.innerHTML = "";
  for (const entry of queue) {
    const scope = scopeItems.find((s) => s.id === entry.scopeItemId);
    const card = document.createElement("div");
    card.className = "queued";

    const img = document.createElement("img");
    img.src = entry.dataUrl;
    img.alt = `Redacted capture ${entry.captureId}`;

    const meta = document.createElement("div");
    const quantity = entry.abstained
      ? "<em>abstained</em>"
      : entry.estimatedQuantity === null
        ? "<em>not entered</em>"
        : `${entry.estimatedQuantity} ${scope ? scope.unitOfMeasure : ""}`;

    meta.innerHTML = [
      `<strong>${entry.captureId}</strong> <span class="muted">${entry.fileName}</span>`,
      `<div class="muted">${scope ? `${scope.trade} — ${scope.description}` : entry.scopeItemId}</div>`,
      `<div class="muted">${entry.area} · ${entry.capturedAt}</div>`,
      `<div>Quantity: ${quantity}</div>`,
      `<div><span class="chip">origin proposed: ${entry.proposedOrigin}</span>`,
      `<span class="chip">face_blur_status: ${entry.faceBlurStatus}</span></div>`,
    ].join("");

    const dl = document.createElement("a");
    dl.href = entry.dataUrl;
    dl.download = `${entry.captureId}-redacted.jpg`;
    dl.textContent = "Download redacted";
    dl.className = "linkish";

    card.append(img, meta, dl);
    list.append(card);
  }
}

function init(): void {
  const scopeSelect = $<HTMLSelectElement>("#scope");
  for (const item of scopeItems) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = `${item.trade} — ${item.description}`;
    scopeSelect.append(opt);
  }

  $<HTMLInputElement>("#captured-at").value = new Date().toISOString().slice(0, 10);

  $<HTMLInputElement>("#file").addEventListener("change", (ev) => {
    void addFiles((ev.target as HTMLInputElement).files);
  });

  const drop = $<HTMLDivElement>("#drop");
  for (const type of ["dragenter", "dragover"]) {
    drop.addEventListener(type, (ev) => {
      ev.preventDefault();
      drop.classList.add("over");
    });
  }
  for (const type of ["dragleave", "drop"]) {
    drop.addEventListener(type, (ev) => {
      ev.preventDefault();
      drop.classList.remove("over");
    });
  }
  drop.addEventListener("drop", (ev) => {
    void addFiles((ev as DragEvent).dataTransfer?.files ?? null);
  });

  $("#rotate").addEventListener("click", () => {
    const shot = activeShot();
    if (!shot) return;
    const { w } = shotSize(shot);
    // Rotate the regions with the image so redactions stay on the faces.
    shot.redactions = shot.redactions.map((r) => ({
      x: w - (r.y + r.h),
      y: r.x,
      w: r.h,
      h: r.w,
    }));
    shot.rotation = ((shot.rotation + 90) % 360) as Shot["rotation"];
    draw();
  });

  $("#undo").addEventListener("click", () => {
    activeShot()?.redactions.pop();
    renderThumbs();
    draw();
  });

  $("#clear").addEventListener("click", () => {
    const shot = activeShot();
    if (!shot) return;
    shot.redactions = [];
    renderThumbs();
    draw();
  });

  $<HTMLInputElement>("#no-people").addEventListener("change", (ev) => {
    const shot = activeShot();
    if (!shot) return;
    shot.noPeople = (ev.target as HTMLInputElement).checked;
    renderThumbs();
    updateGate();
  });

  $<HTMLInputElement>("#abstain").addEventListener("change", (ev) => {
    $<HTMLInputElement>("#quantity").disabled = (ev.target as HTMLInputElement).checked;
  });

  $("#queue").addEventListener("click", queueActive);

  window.addEventListener("resize", draw);

  renderQueue();
  draw();
}

init();

// Loaded as <script type="module">. This marks the file a module so its
// top-level names stay local rather than colliding in the global scope.
export {};
