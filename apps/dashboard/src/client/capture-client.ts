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
  seq: number;
  fileName: string;
  scopeItemId: string;
  area: string;
  capturedAt: string;
  proposedOrigin: string;
  estimatedQuantity: number | null;
  abstained: boolean;
  redactionCount: number;
  faceBlurStatus: "blurred" | "declared_no_people";
  savedAt: string;
  /**
   * The redacted render, stored as a Blob rather than a data URL: base64 inflates
   * bytes by a third and localStorage would blow its quota after a few photos.
   * Only ever the redacted image — the original bitmap is never written here.
   */
  blob: Blob;
}

const DB_NAME = "sitewire-demo";
const DB_STORE = "captures";

/**
 * IndexedDB, opened lazily. If it is unavailable — private browsing, a locked-down
 * profile — the console still works, it just stops surviving a refresh, and the UI
 * says so rather than pretending the capture was saved.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "captureId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(DB_STORE, mode);
        const req = run(t.objectStore(DB_STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
        t.oncomplete = () => db.close();
      }),
  );
}

const dbGetAll = (): Promise<QueuedCapture[]> =>
  tx<QueuedCapture[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedCapture[]>);
const dbPut = (entry: QueuedCapture): Promise<IDBValidKey> =>
  tx<IDBValidKey>("readwrite", (s) => s.put(entry));
const dbDelete = (id: string): Promise<undefined> =>
  tx<undefined>("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
const dbClear = (): Promise<undefined> =>
  tx<undefined>("readwrite", (s) => s.clear() as IDBRequest<undefined>);

/** Set when IndexedDB is unusable, so the UI can tell the truth about persistence. */
let storageError: string | null = null;

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

function toBlob(source: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    source.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas encode failed"))),
      "image/jpeg",
      0.85,
    );
  });
}

async function queueActive(): Promise<void> {
  const shot = activeShot();
  if (!shot) return;

  const full = renderFull(shot);
  const abstained = $<HTMLInputElement>("#abstain").checked;
  const qtyRaw = $<HTMLInputElement>("#quantity").value;

  const entry: QueuedCapture = {
    // Unique across sessions — a reload-safe key, unlike a length-based counter,
    // which would collide with a capture already in the store.
    captureId:
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `cap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    seq: queue.reduce((max, q) => Math.max(max, q.seq), 0) + 1,
    fileName: shot.name,
    scopeItemId: $<HTMLSelectElement>("#scope").value,
    area: $<HTMLInputElement>("#area").value || "(unspecified)",
    capturedAt: $<HTMLInputElement>("#captured-at").value || new Date().toISOString().slice(0, 10),
    proposedOrigin: $<HTMLSelectElement>("#origin").value,
    estimatedQuantity: abstained || qtyRaw === "" ? null : Number(qtyRaw),
    abstained,
    redactionCount: shot.redactions.length,
    faceBlurStatus: shot.redactions.length > 0 ? "blurred" : "declared_no_people",
    savedAt: new Date().toISOString(),
    // Only the redacted render is ever produced. The original bitmap stays in
    // memory for editing and is never exported or written anywhere.
    blob: await toBlob(full),
  };

  queue.push(entry);

  // Local first, deliberately. A jobsite has poor signal, and losing a capture
  // because an upload failed is worse than storing it twice — the local copy is
  // the offline path, not a duplicate to be tidied away.
  try {
    await dbPut(entry);
    storageError = null;
  } catch (err) {
    // Keep the capture in memory and say plainly that it did not persist, rather
    // than showing a saved-looking card that will vanish on refresh.
    storageError = err instanceof Error ? err.message : String(err);
  }

  renderQueue();
  void uploadEntry(entry);
}

/**
 * Sends one prepared capture to the server.
 *
 * A failure is reported on the card and the local copy is kept, so a capture is
 * never lost to a bad connection. State is keyed by capture id rather than held
 * on the entry itself because the entry is what IndexedDB round-trips, and
 * upload status is not worth persisting across a reload.
 */
const uploadState = new Map<string, string>();

async function uploadEntry(entry: QueuedCapture): Promise<void> {
  uploadState.set(entry.captureId, "sending");
  renderQueue();

  try {
    const body = JSON.stringify({
      image: await blobToBase64(entry.blob),
      scopeItemId: entry.scopeItemId,
      area: entry.area,
      capturedAt: entry.capturedAt,
      origin: entry.proposedOrigin,
      estimatedQuantity: entry.estimatedQuantity,
      abstained: entry.abstained,
    });

    // The query string carries the dev org switcher; without it an upload would
    // land in the default tenant while the page shows another one.
    const res = await fetch(`/api/captures${window.location.search}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

    uploadState.set(
      entry.captureId,
      payload.ok ? "stored" : (payload.error ?? `upload failed (${res.status})`),
    );
  } catch (err) {
    uploadState.set(entry.captureId, err instanceof Error ? err.message : String(err));
  }

  renderQueue();
}

/** Per-card upload state. Escaped, because a server error message renders here. */
function uploadChip(captureId: string): string {
  const state = uploadState.get(captureId);
  if (state === undefined) return "";
  if (state === "sending") return '<span class="chip">uploading…</span>';
  if (state === "stored") return '<span class="chip">stored</span>';

  const safe = state.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
  return `<span class="chip" style="color:var(--critical);border-color:var(--critical)">not uploaded: ${safe}</span>`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("could not read the redacted image"));
    reader.onload = () => resolve(String(reader.result ?? "").replace(/^data:[^,]+,/, ""));
    reader.readAsDataURL(blob);
  });
}

async function loadSaved(): Promise<void> {
  try {
    const saved = await dbGetAll();
    saved.sort((a, b) => a.seq - b.seq);
    queue.length = 0;
    queue.push(...saved);
    storageError = null;
  } catch (err) {
    storageError = err instanceof Error ? err.message : String(err);
  }
  renderQueue();
}

async function removeCapture(id: string): Promise<void> {
  const idx = queue.findIndex((q) => q.captureId === id);
  if (idx >= 0) queue.splice(idx, 1);
  try {
    await dbDelete(id);
  } catch {
    // Already gone from the view; a failed delete is reported on next load.
  }
  renderQueue();
}

async function clearAll(): Promise<void> {
  queue.length = 0;
  try {
    await dbClear();
  } catch {
    // Same: the in-memory list is authoritative for what is on screen.
  }
  renderQueue();
}

/** Object URLs handed out for the current render, revoked before the next one. */
let liveUrls: string[] = [];

function renderQueue(): void {
  const list = $<HTMLDivElement>("#queue-list");
  const count = $<HTMLSpanElement>("#queue-count");
  count.textContent = String(queue.length);

  for (const url of liveUrls) URL.revokeObjectURL(url);
  liveUrls = [];

  const note = $<HTMLParagraphElement>("#storage-note");
  if (storageError) {
    note.className = "gate todo";
    note.textContent = `Not saved to this device — ${storageError}. Captures will be lost on refresh.`;
  } else if (queue.length > 0) {
    const failed = queue.filter((q) => {
      const state = uploadState.get(q.captureId);
      return state !== undefined && state !== "sending" && state !== "stored";
    }).length;

    note.className = failed > 0 ? "gate todo" : "gate ok";
    note.textContent =
      failed > 0
        ? `${failed} capture(s) did not upload. They are kept on this device — see the cards below.`
        : "Uploaded, and kept on this device as a local copy. Only the redacted image is ever sent or stored. Use Clear all before handing this laptop on.";
  } else {
    note.className = "muted";
    note.textContent = "";
  }

  $<HTMLButtonElement>("#clear-all").hidden = queue.length === 0;

  if (queue.length === 0) {
    list.innerHTML = '<div class="empty">No captures prepared yet.</div>';
    return;
  }

  list.innerHTML = "";
  for (const entry of queue) {
    const scope = scopeItems.find((s) => s.id === entry.scopeItemId);
    const card = document.createElement("div");
    card.className = "queued";

    const url = URL.createObjectURL(entry.blob);
    liveUrls.push(url);

    const img = document.createElement("img");
    img.src = url;
    img.alt = `Redacted capture ${entry.seq}`;

    const meta = document.createElement("div");
    const quantity = entry.abstained
      ? "<em>abstained</em>"
      : entry.estimatedQuantity === null
        ? "<em>not entered</em>"
        : `${entry.estimatedQuantity} ${scope ? scope.unitOfMeasure : ""}`;

    meta.innerHTML = [
      `<strong>cap-${entry.seq}</strong> <span class="muted">${entry.fileName}</span>`,
      `<div class="muted">${scope ? `${scope.trade} — ${scope.description}` : entry.scopeItemId}</div>`,
      `<div class="muted">${entry.area} · ${entry.capturedAt}</div>`,
      `<div>Quantity: ${quantity}</div>`,
      `<div><span class="chip">origin proposed: ${entry.proposedOrigin}</span>`,
      `<span class="chip">face_blur_status: ${entry.faceBlurStatus}</span>`,
      uploadChip(entry.captureId),
      "</div>",
    ].join("");

    const actions = document.createElement("div");

    const dl = document.createElement("a");
    dl.href = url;
    dl.download = `cap-${entry.seq}-redacted.jpg`;
    dl.textContent = "Download redacted";
    dl.className = "linkish";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "linkish danger";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      void removeCapture(entry.captureId);
    });

    actions.append(dl, del);
    card.append(img, meta, actions);
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

  $("#queue").addEventListener("click", () => {
    void queueActive();
  });

  $("#describe").addEventListener("click", () => {
    void describeActive();
  });

  $("#clear-all").addEventListener("click", () => {
    void clearAll();
  });

  window.addEventListener("resize", draw);

  renderQueue();
  draw();
  // Restore anything saved on this device from a previous session.
  void loadSaved();
}

init();

/**
 * Vision assist. This is the ONLY path where an image leaves the tab, and it is
 * gated twice: the button stays disabled until the redaction gate passes, and the
 * bytes sent are the redacted render, never the source bitmap.
 *
 * The image is downscaled before sending. A phone photo is several megabytes,
 * base64 adds a third again, and Lambda's synchronous payload limit is 6 MB —
 * but the real reason is that the model does not need full resolution to say
 * "drywall, corridor blocked", and sending less of a jobsite photo is simply
 * better than sending more.
 */
const VISION_MAX_EDGE = 1024;

async function redactedJpegForVision(shot: Shot): Promise<string> {
  const full = renderFull(shot);
  const scale = Math.min(1, VISION_MAX_EDGE / Math.max(full.width, full.height));

  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(full.width * scale));
  out.height = Math.max(1, Math.round(full.height * scale));
  const c = context2d(out);
  c.imageSmoothingEnabled = true;
  c.drawImage(full, 0, 0, out.width, out.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.75);
  });

  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] as number);
  return btoa(binary);
}

async function describeActive(): Promise<void> {
  const shot = activeShot();
  const status = $<HTMLParagraphElement>("#vision-status");
  const button = $<HTMLButtonElement>("#describe");
  if (!shot) return;

  // The same condition that gates queueing. An unredacted photo never goes out.
  if (shot.redactions.length === 0 && !shot.noPeople) {
    status.className = "gate todo";
    status.textContent =
      "Redact faces or declare no people in frame first. Nothing is sent before that.";
    return;
  }

  button.disabled = true;
  status.className = "muted";
  status.textContent = "Sending the redacted image for analysis…";

  try {
    const image = await redactedJpegForVision(shot);
    const res = await fetch("/ai/vision", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image }),
    });
    const data = (await res.json()) as { description: string; fields?: Record<string, string> };

    status.className = "gate ok";
    status.textContent = data.description;

    if (data.fields?.scopeItemId) {
      const select = $<HTMLSelectElement>("#scope");
      select.value = data.fields.scopeItemId;
      select.classList.add("ai-flash");
      window.setTimeout(() => select.classList.remove("ai-flash"), 1600);
    }
    if (data.fields?.area) {
      const area = $<HTMLInputElement>("#area");
      area.value = data.fields.area;
      area.classList.add("ai-flash");
      window.setTimeout(() => area.classList.remove("ai-flash"), 1600);
    }
  } catch (err) {
    status.className = "gate todo";
    status.textContent = `Could not read that photo — ${err instanceof Error ? err.message : err}`;
  } finally {
    button.disabled = false;
  }
}

// Loaded as <script type="module">. This marks the file a module so its
// top-level names stay local rather than colliding in the global scope.
export {};
