/**
 * Persisting a capture.
 *
 * Until now the capture console wrote a redacted JPEG into the browser's own
 * IndexedDB and told the user plainly that nothing had been uploaded. This is
 * the path that makes that no longer true: bytes to S3, a row to the domain
 * table, and the classification alongside it.
 *
 * **The project is derived, never accepted.** The client sends a scope item id;
 * the project comes from looking that scope item up in the caller's own tenant.
 * A client-supplied `projectId` would be a way to write a row into another
 * tenant's project, and the fact that the scope item lookup is already
 * tenant-scoped is what makes deriving it safe.
 *
 * **Only the redacted render arrives here.** The console gates its queue button
 * on the same redaction check that gates the AI call, and every byte-producing
 * path in that client goes through `renderFull()`, which mosaics regions into a
 * fresh canvas before encoding. The original bitmap is never encoded at all.
 * That is a property of the client, though, not something this module can
 * verify — it receives bytes and cannot know what was cropped out of them.
 */

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { type Classification, classify } from "@sitewireai/classify";
import * as db from "@sitewireai/db";
import type { ScopeItem } from "./types.js";

const BUCKET = process.env.SITEWIREAI_BUCKET ?? "";

/** Origins a client may claim. Anything else is rejected rather than coerced. */
const ORIGINS = new Set(["field", "self_measured", "simulated"]);

/** 12 MB decoded. A phone photo redacted through a canvas lands well under it. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

let s3: S3Client | null = null;

function client(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

export function captureStorageConfigured(): boolean {
  return Boolean(BUCKET && db.databaseConfigured());
}

export interface CaptureUpload {
  image: string;
  scopeItemId: string;
  area: string;
  capturedAt: string;
  origin: string;
  capturedBy: string;
  estimatedQuantity: number | null;
  abstained: boolean;
}

export interface CaptureSaved {
  captureId: string;
  projectId: string;
  classification: unknown;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function parseUpload(raw: string): CaptureUpload | { error: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return { error: "Body was not JSON." };
  }

  const image = str(parsed.image).replace(/^data:[^,]+,/, "");
  if (!image) return { error: "No image supplied." };

  const scopeItemId = str(parsed.scopeItemId).trim();
  if (!scopeItemId) return { error: "A scope item is required." };

  const origin = str(parsed.origin, "field");
  if (!ORIGINS.has(origin)) return { error: `Unknown origin: ${origin}` };

  const abstained = parsed.abstained === true;
  const rawQuantity = parsed.estimatedQuantity;
  const estimatedQuantity =
    abstained || rawQuantity === null || rawQuantity === undefined
      ? null
      : Number(rawQuantity);

  if (estimatedQuantity !== null && !Number.isFinite(estimatedQuantity)) {
    return { error: "Quantity must be a number, or absent." };
  }
  if (estimatedQuantity !== null && estimatedQuantity < 0) {
    return { error: "Quantity cannot be negative." };
  }

  return {
    image,
    scopeItemId,
    area: str(parsed.area).slice(0, 200),
    capturedAt: str(parsed.capturedAt).slice(0, 40),
    origin,
    capturedBy: str(parsed.capturedBy).slice(0, 120),
    estimatedQuantity,
    abstained,
  };
}

/**
 * Writes one capture for one tenant.
 *
 * Order matters: the image lands in S3 first, then the row that points at it.
 * The failure that leaves an orphaned object in S3 is cheap and invisible; the
 * one that leaves a row pointing at bytes that were never written shows up as a
 * broken image in a change-order package.
 */
export async function saveCapture(
  orgId: string,
  upload: CaptureUpload,
  scopeItems: ScopeItem[],
): Promise<CaptureSaved | { error: string }> {
  if (!captureStorageConfigured()) {
    return { error: "Capture storage is not configured on this server." };
  }

  // The scope item must be one this tenant owns — which is also where the
  // project comes from. A client-supplied project id is never trusted.
  const scopeItem = scopeItems.find((s) => s.id === upload.scopeItemId);
  if (!scopeItem) return { error: "That scope item does not belong to this project." };

  const bytes = Buffer.from(upload.image, "base64");
  if (bytes.length === 0) return { error: "Image did not decode." };
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { error: `Image is ${Math.round(bytes.length / 1024 / 1024)} MB; the limit is 12 MB.` };
  }

  const captureId = `cap-${crypto.randomUUID()}`;
  const imageKey = `${captureId}.jpg`;

  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `images/${imageKey}`,
      Body: bytes,
      ContentType: "image/jpeg",
    }),
  );

  // **This is where the trainer runs.** Every capture — a client's from the
  // capture console, an admin's from the admin console — goes through the same
  // classifier the trainer uses and produces the same `Classification` shape, so
  // the reading that comes back can be adjusted afterwards rather than only read.
  //
  // Best-effort, deliberately: a model outage must not cost someone their photo.
  // The capture is stored either way and shows as unclassified, which the
  // adjustment surface already knows how to render.
  //
  // `describeCapture` used to run here and no longer does. It answers a different
  // question — which scope item and area to put in the form — and it still does
  // that, live, from the console. What is stored on the row is a classification.
  let classification: Classification | null = null;
  try {
    classification = await classify({
      imageBase64: upload.image,
      mediaType: "image/jpeg",
      projectRef: scopeItem.description,
      area: upload.area || "",
    });
  } catch {
    classification = null;
  }

  await db.putItem(orgId, "CAPTURE", captureId, {
    projectId: scopeItem.projectId,
    area: upload.area || "(unspecified)",
    capturedAt: upload.capturedAt || new Date().toISOString().slice(0, 10),
    capturedBy: upload.capturedBy,
    origin: upload.origin,
    imageKey,
    classification,
  });

  // The estimate is a separate row because it is a separate claim: the photo is
  // evidence, the quantity is a measurement someone made from it. An abstention
  // is recorded rather than skipped — a photo nobody could measure is signal.
  if (upload.estimatedQuantity !== null || upload.abstained) {
    await db.putItem(orgId, "ESTIMATE", `est-${captureId}`, {
      captureId,
      scopeItemId: scopeItem.id,
      estimatedQuantity: upload.estimatedQuantity,
      confidence: 1,
      abstained: upload.abstained,
      // Recorded by a person on the capture form, not produced by a model.
      modelVersion: "operator-entered",
    });
  }

  return { captureId, projectId: scopeItem.projectId, classification };
}
