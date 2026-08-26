/**
 * Intake: read photos, redact faces, upload the redacted render.
 *
 * The original file is decoded in this tab and never sent anywhere. What gets
 * posted is a fresh JPEG encoded from a canvas that already has the mosaics baked
 * into it — so the bytes on disk cannot be un-redacted, because the unredacted
 * pixels were never in the request.
 *
 * Mosaic rather than blur: a gaussian blur is a reversible-ish filter and there is
 * a genre of paper about recovering faces from one. Averaging whole blocks throws
 * the information away. The block size scales with the region so a small face and
 * a large one are destroyed to the same degree.
 */

interface Photo {
  name: string;
  /** Full-resolution, rotation already applied. Redaction is drawn from this. */
  base: HTMLCanvasElement;
  regions: { x: number; y: number; w: number; h: number }[];
  noPeople: boolean;
  capturedAt: string;
  rotation: number;
  original: ImageBitmap;
  /** The detector that proposed this photo's rectangles, or "" if a human drew them. */
  assistedBy: string;
  /** A human looked at those proposals. Required before a proposed set can be saved. */
  confirmed: boolean;
}

const photos: Photo[] = [];
let active = -1;

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element: ${id}`);
  return node as T;
};

const drop = el<HTMLDivElement>("drop");
const fileInput = el<HTMLInputElement>("file");
const thumbs = el<HTMLDivElement>("thumbs");
const empty = el<HTMLDivElement>("empty");
const editorWrap = el<HTMLDivElement>("editor-wrap");
const stage = el<HTMLCanvasElement>("stage");
const noPeople = el<HTMLInputElement>("no-people");
const photoMeta = el<HTMLParagraphElement>("photo-meta");
const gate = el<HTMLParagraphElement>("gate");
const addButton = el<HTMLButtonElement>("add");
const addStatus = el<HTMLParagraphElement>("add-status");
const labeller = el<HTMLInputElement>("labeller");
const sourceSelect = el<HTMLSelectElement>("source");
const sourceNote = el<HTMLParagraphElement>("source-note");
const projectInput = el<HTMLInputElement>("project");
const areaInput = el<HTMLInputElement>("area");
const capturedAt = el<HTMLInputElement>("captured-at");
const notes = el<HTMLTextAreaElement>("notes");
const findPeople = el<HTMLButtonElement>("find-people");
const detectorStatus = el<HTMLSpanElement>("detector-status");
const confirmRow = el<HTMLDivElement>("confirm-row");
const confirmProposals = el<HTMLInputElement>("confirm-proposals");

const SOURCE_NOTES: Record<string, string> = {
  self_measured:
    "Primary source. A trade-qualified person measured this scope directly — the only source eligible for the headline held-out set.",
  anchor_as_built:
    "The calibration anchor's reported quantities. Used to check our conventions against a real sub's; never the headline number.",
  production_correction:
    "A foreman's correction to a live estimate. Trains and validates; cannot headline, because it is a correction to the model's own output.",
  simulated:
    "Rendered or generated. May train a model and may never measure one — it gets no measuring split, ever.",
};

// ---- EXIF -----------------------------------------------------------------

/**
 * The two EXIF tags worth reading: orientation, without which every second phone
 * photo is sideways, and the original capture date, which is otherwise a field
 * somebody has to remember and type twenty times.
 */
function readExif(buffer: ArrayBuffer): { orientation: number; capturedAt: string } {
  const fallback = { orientation: 1, capturedAt: "" };
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return fallback;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1) return readApp1(view, offset + 4, size - 2) ?? fallback;
    if (marker === 0xda) break;
    offset += 2 + size;
  }
  return fallback;
}

function readApp1(
  view: DataView,
  start: number,
  length: number,
): { orientation: number; capturedAt: string } | null {
  if (start + 10 > view.byteLength) return null;
  // "Exif\0\0"
  if (view.getUint32(start) !== 0x45786966) return null;

  const tiff = start + 6;
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  let orientation = 1;
  let capturedAt = "";

  const readDirectory = (dirOffset: number, exifPointerOnly: boolean): number | null => {
    if (dirOffset + 2 > view.byteLength) return null;
    const count = u16(dirOffset);
    let sub: number | null = null;

    for (let i = 0; i < count; i++) {
      const entry = dirOffset + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      const tag = u16(entry);

      if (tag === 0x0112 && !exifPointerOnly) orientation = u16(entry + 8);
      if (tag === 0x8769) sub = tiff + u32(entry + 8);
      if (tag === 0x9003 || tag === 0x0132) {
        const valueOffset = tiff + u32(entry + 8);
        // "YYYY:MM:DD HH:MM:SS" — only the date half is wanted here.
        let text = "";
        for (let c = 0; c < 10 && valueOffset + c < view.byteLength; c++) {
          text += String.fromCharCode(view.getUint8(valueOffset + c));
        }
        const iso = text.replace(/^(\d{4}):(\d{2}):(\d{2})$/, "$1-$2-$3");
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && !capturedAt) capturedAt = iso;
      }
    }
    return sub;
  };

  const ifd0 = tiff + u32(tiff + 4);
  const exifIfd = readDirectory(ifd0, false);
  if (exifIfd !== null && start + length > exifIfd) readDirectory(exifIfd, true);

  return { orientation, capturedAt };
}

/** EXIF orientation as a rotation in degrees. Mirrored variants are rare and are
 *  treated as their unmirrored rotation — a mirrored jobsite photo is still a
 *  usable one, and silently flipping geometry would be worse. */
function rotationFor(orientation: number): number {
  if (orientation === 3 || orientation === 4) return 180;
  if (orientation === 5 || orientation === 6) return 90;
  if (orientation === 7 || orientation === 8) return 270;
  return 0;
}

// ---- canvas ---------------------------------------------------------------

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable in this browser");
  return ctx;
}

function baseFor(bitmap: ImageBitmap, rotation: number): HTMLCanvasElement {
  const swapped = rotation === 90 || rotation === 270;
  const canvas = document.createElement("canvas");
  canvas.width = swapped ? bitmap.height : bitmap.width;
  canvas.height = swapped ? bitmap.width : bitmap.height;
  const ctx = context(canvas);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  ctx.restore();
  return canvas;
}

/**
 * Draws the photo with its regions mosaicked, at whatever size the target is.
 * Used for both the on-screen preview and the full-resolution upload render, so
 * what you approve is what gets stored.
 */
function renderRedacted(target: HTMLCanvasElement, photo: Photo): void {
  const ctx = context(target);
  ctx.drawImage(photo.base, 0, 0, target.width, target.height);

  for (const region of photo.regions) {
    const x = Math.round(region.x * target.width);
    const y = Math.round(region.y * target.height);
    const w = Math.max(1, Math.round(region.w * target.width));
    const h = Math.max(1, Math.round(region.h * target.height));
    if (x < 0 || y < 0 || x + w > target.width || y + h > target.height) continue;

    const block = Math.max(4, Math.round(Math.min(w, h) / 6));
    const pixels = ctx.getImageData(x, y, w, h);

    for (let by = 0; by < h; by += block) {
      for (let bx = 0; bx < w; bx += block) {
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let dy = 0; dy < block && by + dy < h; dy++) {
          for (let dx = 0; dx < block && bx + dx < w; dx++) {
            const index = ((by + dy) * w + (bx + dx)) * 4;
            r += pixels.data[index] ?? 0;
            g += pixels.data[index + 1] ?? 0;
            b += pixels.data[index + 2] ?? 0;
            count++;
          }
        }
        if (count === 0) continue;
        const avg = [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
        for (let dy = 0; dy < block && by + dy < h; dy++) {
          for (let dx = 0; dx < block && bx + dx < w; dx++) {
            const index = ((by + dy) * w + (bx + dx)) * 4;
            pixels.data[index] = avg[0] ?? 0;
            pixels.data[index + 1] = avg[1] ?? 0;
            pixels.data[index + 2] = avg[2] ?? 0;
          }
        }
      }
    }
    ctx.putImageData(pixels, x, y);
  }
}

const MAX_PREVIEW_WIDTH = 900;

function drawStage(): void {
  const photo = photos[active];
  if (!photo) return;
  const scale = Math.min(1, MAX_PREVIEW_WIDTH / photo.base.width);
  stage.width = Math.round(photo.base.width * scale);
  stage.height = Math.round(photo.base.height * scale);
  renderRedacted(stage, photo);

  // Outline every mosaic so a redaction is visible as a decision, not just as a
  // smudge that might be a dusty lens.
  const ctx = context(stage);
  ctx.strokeStyle = "#4c8dff";
  ctx.lineWidth = 2;
  for (const r of photo.regions) {
    ctx.strokeRect(r.x * stage.width, r.y * stage.height, r.w * stage.width, r.h * stage.height);
  }

  const assisted = photo.assistedBy
    ? ` · ${photo.regions.length} proposed by ${photo.assistedBy}`
    : "";
  photoMeta.textContent = `${photo.name} · ${photo.base.width}×${photo.base.height} · ${photo.regions.length} redaction(s)${assisted}`;
  noPeople.checked = photo.noPeople;
  confirmRow.hidden = !photo.assistedBy;
  confirmProposals.checked = photo.confirmed;
}

// ---- state ----------------------------------------------------------------

/**
 * Has a human settled this photo's redaction?
 *
 * Machine-proposed rectangles do not count on their own. Without that second
 * clause a detector could draw three boxes, miss a fourth face, and the photo
 * would sail through a gate that exists precisely to stop that.
 */
function decided(photo: Photo): boolean {
  if (photo.assistedBy && !photo.confirmed) return false;
  return photo.noPeople || photo.regions.length > 0;
}

function renderThumbs(): void {
  thumbs.replaceChildren();
  photos.forEach((photo, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `thumb${index === active ? " active" : ""}`;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 84 / photo.base.width);
    canvas.width = Math.round(photo.base.width * scale);
    canvas.height = Math.round(photo.base.height * scale);
    renderRedacted(canvas, photo);
    button.appendChild(canvas);

    const tag = document.createElement("span");
    tag.className = `thumb-tag ${decided(photo) ? "ok" : "todo"}`;
    tag.textContent = decided(photo) ? "✓" : "!";
    button.appendChild(tag);

    button.addEventListener("click", () => {
      active = index;
      renderThumbs();
      drawStage();
    });
    thumbs.appendChild(button);
  });

  const any = photos.length > 0;
  empty.hidden = any;
  editorWrap.hidden = !any;
  if (any && active === -1) active = 0;
  renderGate();
}

function renderGate(): void {
  const undecided = photos.filter((p) => !decided(p)).length;
  const unconfirmed = photos.filter((p) => p.assistedBy && !p.confirmed).length;
  const problems: string[] = [];
  if (photos.length === 0) problems.push("Add at least one photo.");
  if (undecided > unconfirmed) {
    problems.push(
      `${undecided - unconfirmed} photo(s) still need faces redacted or a no-people declaration.`,
    );
  }
  if (unconfirmed > 0) {
    problems.push(
      `${unconfirmed} photo(s) have rectangles a detector proposed and nobody has confirmed.`,
    );
  }
  if (!labeller.value.trim()) problems.push("Enter your name — the declaration is attributed.");
  if (!projectInput.value.trim()) problems.push("Name the project or site.");

  gate.className = `gate ${problems.length === 0 ? "ok" : "todo"}`;
  gate.innerHTML =
    problems.length === 0
      ? `Ready. ${photos.length} redacted photo(s) will be written to the corpus as unlabelled drafts.`
      : `Before anything is stored:<ul>${problems.map((p) => `<li>${p}</li>`).join("")}</ul>`;
  addButton.disabled = problems.length > 0;
}

// ---- loading --------------------------------------------------------------

async function addFiles(files: FileList | null): Promise<void> {
  if (!files) return;
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const buffer = await file.arrayBuffer();
      const exif = readExif(buffer);
      const bitmap = await createImageBitmap(new Blob([buffer], { type: file.type }));
      const rotation = rotationFor(exif.orientation);
      photos.push({
        name: file.name,
        base: baseFor(bitmap, rotation),
        regions: [],
        noPeople: false,
        capturedAt: exif.capturedAt,
        rotation,
        original: bitmap,
        assistedBy: "",
        confirmed: false,
      });
    } catch {
      addStatus.textContent = `Could not read ${file.name} — skipped.`;
    }
  }
  if (active === -1 && photos.length > 0) active = 0;
  renderThumbs();
  drawStage();
}

fileInput.addEventListener("change", () => {
  void addFiles(fileInput.files).then(() => {
    fileInput.value = "";
  });
});

for (const event of ["dragenter", "dragover"]) {
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
}
for (const event of ["dragleave", "drop"]) {
  drop.addEventListener(event, (e) => {
    e.preventDefault();
    drop.classList.remove("over");
  });
}
drop.addEventListener("drop", (e) => {
  void addFiles((e as DragEvent).dataTransfer?.files ?? null);
});

// ---- drawing redactions ---------------------------------------------------

let dragStart: { x: number; y: number } | null = null;

function pointOf(event: PointerEvent): { x: number; y: number } {
  const rect = stage.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

stage.addEventListener("pointerdown", (event) => {
  if (active === -1) return;
  stage.setPointerCapture(event.pointerId);
  dragStart = pointOf(event);
});

stage.addEventListener("pointermove", (event) => {
  if (!dragStart) return;
  const now = pointOf(event);
  drawStage();
  const ctx = context(stage);
  ctx.strokeStyle = "#4c8dff";
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 2;
  ctx.strokeRect(
    Math.min(dragStart.x, now.x) * stage.width,
    Math.min(dragStart.y, now.y) * stage.height,
    Math.abs(now.x - dragStart.x) * stage.width,
    Math.abs(now.y - dragStart.y) * stage.height,
  );
  ctx.setLineDash([]);
});

stage.addEventListener("pointerup", (event) => {
  const photo = photos[active];
  if (!dragStart || !photo) return;
  const end = pointOf(event);
  const region = {
    x: Math.min(dragStart.x, end.x),
    y: Math.min(dragStart.y, end.y),
    w: Math.abs(end.x - dragStart.x),
    h: Math.abs(end.y - dragStart.y),
  };
  dragStart = null;
  // A stray click is not a redaction. The floor is roughly a thumbnail-sized face.
  if (region.w < 0.01 || region.h < 0.01) {
    drawStage();
    return;
  }
  photo.regions.push(region);
  renderThumbs();
  drawStage();
});

el<HTMLButtonElement>("rotate").addEventListener("click", () => {
  const photo = photos[active];
  if (!photo) return;
  photo.rotation = (photo.rotation + 90) % 360;
  photo.base = baseFor(photo.original, photo.rotation);
  // Rotating moves every region somewhere it no longer means anything, so they go —
  // and with them any claim that a detector or a human had settled this photo.
  photo.regions = [];
  photo.assistedBy = "";
  photo.confirmed = false;
  renderThumbs();
  drawStage();
});

el<HTMLButtonElement>("undo").addEventListener("click", () => {
  photos[active]?.regions.pop();
  renderThumbs();
  drawStage();
});

el<HTMLButtonElement>("clear").addEventListener("click", () => {
  const photo = photos[active];
  if (!photo) return;
  photo.regions = [];
  renderThumbs();
  drawStage();
});

el<HTMLButtonElement>("discard").addEventListener("click", () => {
  if (active === -1) return;
  photos.splice(active, 1);
  active = photos.length === 0 ? -1 : Math.min(active, photos.length - 1);
  renderThumbs();
  if (active !== -1) drawStage();
});

noPeople.addEventListener("change", () => {
  const photo = photos[active];
  if (!photo) return;
  photo.noPeople = noPeople.checked;
  renderThumbs();
});

confirmProposals.addEventListener("change", () => {
  const photo = photos[active];
  if (!photo) return;
  photo.confirmed = confirmProposals.checked;
  renderThumbs();
});

for (const input of [labeller, projectInput]) {
  input.addEventListener("input", renderGate);
}

sourceSelect.addEventListener("change", () => {
  sourceNote.textContent = SOURCE_NOTES[sourceSelect.value] ?? "";
});

// ---- detection assist -----------------------------------------------------

/**
 * Whether the local sidecar is up, checked once at boot.
 *
 * Checked once rather than per click because the answer does not change during a
 * session in any way worth a round trip, and because a button whose enabled state
 * flickers is worse than one that is honestly disabled with a reason next to it.
 */
let detectorAvailable = false;
let detectorWeights = "";

async function checkDetector(): Promise<void> {
  try {
    const response = await fetch("/api/prelabel/health");
    const health = (await response.json()) as {
      available?: boolean;
      weights?: string;
      knowsPeople?: boolean;
      reason?: string;
    };

    detectorAvailable = health.available === true && health.knowsPeople === true;
    detectorWeights = health.weights ?? "";

    if (health.available && !health.knowsPeople) {
      // A model that cannot detect people is not a broken detector, it is the
      // wrong one for this job — and saying so beats a button that finds nothing.
      detectorStatus.textContent = `${detectorWeights} has no person class, so it cannot help with redaction.`;
    } else if (!health.available) {
      detectorStatus.textContent = health.reason ?? "No detector running.";
    } else {
      detectorStatus.textContent = `${detectorWeights} ready.`;
    }
  } catch {
    detectorStatus.textContent = "No detector running — draw the rectangles by hand.";
  }
  findPeople.disabled = !detectorAvailable;
}

/**
 * The redacted-so-far render is what gets sent, not the original.
 *
 * That matters: if a labeller has already mosaicked two faces by hand and then
 * asks for help with the rest, the detector sees the mosaics rather than the
 * faces. It costs a little accuracy on already-handled regions and means the
 * unredacted frame never crosses even a loopback socket unnecessarily.
 */
function currentRenderBase64(photo: Photo): string {
  const canvas = document.createElement("canvas");
  // Detection does not need full resolution and a 12-megapixel phone photo makes
  // the round trip several seconds slower for no gain in what it finds.
  const scale = Math.min(1, 1280 / photo.base.width);
  canvas.width = Math.round(photo.base.width * scale);
  canvas.height = Math.round(photo.base.height * scale);
  renderRedacted(canvas, photo);
  return canvas.toDataURL("image/jpeg", 0.85);
}

findPeople.addEventListener("click", () => {
  const photo = photos[active];
  if (!photo) return;

  findPeople.disabled = true;
  detectorStatus.textContent = "Looking…";

  void (async () => {
    try {
      const response = await fetch("/api/prelabel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: currentRenderBase64(photo), want: "people" }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        model?: string;
        proposals?: { x: number; y: number; w: number; h: number; confidence: number }[];
        error?: string;
      };

      if (!response.ok || !result.ok) {
        detectorStatus.textContent = result.error ?? "The detector could not help with that one.";
        return;
      }

      const proposals = result.proposals ?? [];
      if (proposals.length === 0) {
        // Deliberately not phrased as "no people found". The labeller is the one
        // who decides that, and a detector reporting nothing is the single most
        // dangerous moment in this whole flow.
        detectorStatus.textContent =
          "Nothing proposed. That is not the same as nobody being there — check the photo yourself.";
        return;
      }

      // Proposals are padded outward. A tight body box leaves hair, an ear or a
      // shoulder tattoo outside the mosaic, and erring large costs nothing but a
      // few pixels of wall.
      const pad = 0.02;
      for (const p of proposals) {
        photo.regions.push({
          x: Math.max(0, p.x - pad),
          y: Math.max(0, p.y - pad),
          w: Math.min(1 - Math.max(0, p.x - pad), p.w + pad * 2),
          h: Math.min(1 - Math.max(0, p.y - pad), p.h + pad * 2),
        });
      }
      photo.assistedBy = result.model ?? detectorWeights;
      photo.confirmed = false;

      detectorStatus.textContent = `${proposals.length} proposed by ${photo.assistedBy}. Check them.`;
      renderThumbs();
      drawStage();
    } finally {
      findPeople.disabled = !detectorAvailable;
    }
  })();
});

// ---- upload ---------------------------------------------------------------

function fullResolutionRender(photo: Photo): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = photo.base.width;
  canvas.height = photo.base.height;
  renderRedacted(canvas, photo);
  return canvas;
}

async function upload(photo: Photo): Promise<{ ok: boolean; message: string }> {
  const canvas = fullResolutionRender(photo);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

  const response = await fetch("/api/samples", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image: dataUrl,
      mime: "image/jpeg",
      width: canvas.width,
      height: canvas.height,
      source: sourceSelect.value,
      projectRef: projectInput.value,
      area: areaInput.value,
      capturedAt: photo.capturedAt || capturedAt.value,
      captureNotes: notes.value,
      redaction: {
        declaredNoPeople: photo.noPeople,
        regions: photo.regions,
        declaredBy: labeller.value,
        assistedBy: photo.assistedBy,
        confirmedByHuman: photo.confirmed,
      },
    }),
  });

  const payload = (await response.json()) as { error?: string; duplicateOf?: string };
  if (response.ok) return { ok: true, message: "" };
  if (response.status === 409 && payload.duplicateOf) {
    return { ok: false, message: `${photo.name}: already in the corpus, skipped.` };
  }
  return { ok: false, message: `${photo.name}: ${payload.error ?? response.statusText}` };
}

addButton.addEventListener("click", () => {
  addButton.disabled = true;
  addStatus.textContent = "Encoding and uploading…";

  void (async () => {
    const failures: string[] = [];
    let added = 0;

    // Sequential rather than parallel: a full-resolution mosaic is CPU-bound, and
    // twenty of them at once turns the tab into a beachball on the machine
    // somebody is trying to work on.
    for (const photo of [...photos]) {
      const result = await upload(photo);
      if (result.ok) {
        added++;
        photos.splice(photos.indexOf(photo), 1);
      } else {
        failures.push(result.message);
      }
    }

    active = photos.length === 0 ? -1 : 0;
    renderThumbs();
    if (active !== -1) drawStage();

    addStatus.innerHTML = [
      `${added} photo(s) added as unlabelled drafts.`,
      failures.length ? `<br>${failures.join("<br>")}` : "",
      added > 0 ? ` <a href="/review">Label them now →</a>` : "",
    ].join("");
  })();
});

// ---- boot -----------------------------------------------------------------

const REMEMBERED = "sitewireai.trainer.labeller";
labeller.value = localStorage.getItem(REMEMBERED) ?? "";
labeller.addEventListener("change", () => localStorage.setItem(REMEMBERED, labeller.value));
capturedAt.value = new Date().toISOString().slice(0, 10);
sourceNote.textContent = SOURCE_NOTES[sourceSelect.value] ?? "";
renderThumbs();
void checkDetector();

/** Marks this file a module, so its names stay its own. */
export {};
