/**
 * The write path: upload a photo, classify it, delete it.
 *
 * Three operations, where there used to be a split-eligibility check, a redaction
 * gate, a readiness gate, a review-threshold router and an export. The rules that
 * needed enforcing all belonged to a training corpus; without one, the honest
 * amount of policy left in this layer is "is this actually an image".
 */

import { classify, classifierAvailable, explainError } from "./classify.js";
import type { Photo } from "./photo.js";
import {
  deletePhoto,
  extensionFor,
  getPhoto,
  listPhotos,
  mediaTypeFor,
  newId,
  putPhoto,
  readImage,
  writeImage,
} from "./store.js";

export interface ApiResult {
  status: number;
  body: unknown;
}

export const jsonType = "application/json; charset=utf-8";

/** 12 MB decoded. A phone photo lands well under it; anything above is a mistake. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Accepts one photograph.
 *
 * Classification is deliberately *not* run here. Upload is a batch — twenty
 * photos off a phone — and firing a model call per photo inside that loop makes
 * the batch as slow as the slowest inference and gives the person nothing to look
 * at while it happens. The library offers classification per photo, and the
 * "classify everything" action does the batch in one place where progress is
 * visible.
 */
export async function createPhoto(raw: string): Promise<ApiResult> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Body was not JSON." } };
  }

  const mime = str(parsed.mime, "image/jpeg");
  const extension = extensionFor(mime);
  if (!extension) {
    return { status: 400, body: { error: `Unsupported image type: ${mime}` } };
  }

  const base64 = str(parsed.image).replace(/^data:[^,]+,/, "");
  if (!base64) return { status: 400, body: { error: "No image supplied." } };

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0) return { status: 400, body: { error: "Image did not decode." } };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      status: 413,
      body: { error: `Image is ${Math.round(bytes.length / 1024 / 1024)} MB; the limit is 12 MB.` },
    };
  }

  const id = newId();
  const imageFile = `${id}${extension}`;
  await writeImage(imageFile, bytes);

  const now = new Date().toISOString();
  const photo: Photo = {
    id,
    imageFile,
    width: num(parsed.width),
    height: num(parsed.height),
    projectRef: str(parsed.projectRef).slice(0, 200),
    area: str(parsed.area).slice(0, 200),
    capturedAt: str(parsed.capturedAt).slice(0, 40),
    notes: str(parsed.notes).slice(0, 2000),
    classification: null,
    createdAt: now,
    updatedAt: now,
  };

  await putPhoto(photo);
  return { status: 201, body: { ok: true, id, imageFile } };
}

/**
 * Runs the model over one photo and stores what comes back.
 *
 * Unlike the draft-then-confirm flow this replaced, the result is written
 * immediately. There is no corpus whose integrity depends on a human having
 * agreed first — the classification is the product's output, it is labelled with
 * the model that produced it, and re-running it costs one click.
 */
export async function classifyPhoto(id: string): Promise<ApiResult> {
  const photo = await getPhoto(id);
  if (!photo) return { status: 404, body: { error: "No such photo." } };

  if (!classifierAvailable()) {
    return {
      status: 503,
      body: { error: "ANTHROPIC_API_KEY is not set. Set it and restart the server." },
    };
  }

  const bytes = await readImage(photo.imageFile);
  if (!bytes) return { status: 409, body: { error: "That photo has no image to read." } };

  try {
    const classification = await classify({
      imageBase64: bytes.toString("base64"),
      mediaType: mediaTypeFor(photo.imageFile),
      projectRef: photo.projectRef,
      area: photo.area,
    });

    const next: Photo = { ...photo, classification, updatedAt: new Date().toISOString() };
    await putPhoto(next);
    return { status: 200, body: { ok: true, photo: next } };
  } catch (err) {
    return { status: 503, body: { error: explainError(err) } };
  }
}

export interface ClassifyAllResult {
  classified: number;
  failed: number;
  remaining: number;
  errors: string[];
}

/** Never send more than this many photos in one click. */
const BATCH_LIMIT = 20;

/**
 * Classifies every photo that has not been classified yet, up to the batch limit.
 *
 * Sequential rather than concurrent: this runs against a rate-limited API, and a
 * burst of twenty parallel image requests is the reliable way to get throttled
 * halfway through and leave the batch in a partial state anyway.
 */
export async function classifyAll(): Promise<ClassifyAllResult> {
  if (!classifierAvailable()) {
    return {
      classified: 0,
      failed: 0,
      remaining: 0,
      errors: ["ANTHROPIC_API_KEY is not set. Set it and restart the server."],
    };
  }

  const pending = (await listPhotos()).filter((p) => !p.classification);
  const batch = pending.slice(0, BATCH_LIMIT);

  let classified = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const photo of batch) {
    const bytes = await readImage(photo.imageFile);
    if (!bytes) {
      failed++;
      errors.push(`${photo.id.slice(0, 8)}: no image on disk`);
      continue;
    }

    try {
      const classification = await classify({
        imageBase64: bytes.toString("base64"),
        mediaType: mediaTypeFor(photo.imageFile),
        projectRef: photo.projectRef,
        area: photo.area,
      });
      await putPhoto({ ...photo, classification, updatedAt: new Date().toISOString() });
      classified++;
    } catch (err) {
      failed++;
      errors.push(`${photo.id.slice(0, 8)}: ${explainError(err)}`);
    }
  }

  return {
    classified,
    failed,
    remaining: Math.max(0, pending.length - batch.length),
    errors,
  };
}

export async function removePhoto(id: string): Promise<ApiResult> {
  return (await deletePhoto(id))
    ? { status: 200, body: { ok: true } }
    : { status: 404, body: { error: "No such photo." } };
}
