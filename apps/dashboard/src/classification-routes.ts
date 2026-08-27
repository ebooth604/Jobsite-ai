/**
 * Reading and adjusting a capture's classification.
 *
 * Every function here takes `orgId` first and passes it straight to the repo,
 * which makes it the DynamoDB partition key. A capture id belonging to another
 * tenant resolves to nothing, so there is no shape of request here that reaches
 * across a tenant boundary — the same property that closed the `?project=` hole.
 */

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  type Classification,
  CONDITION_TYPES,
  HAND_CLASSIFIED,
  isSeverity,
  type Severity,
  TRADES,
} from "@sitewireai/classify";
import * as db from "@sitewireai/db";
import type { CaptureWithImage } from "./classification-view.js";
import { classificationsView, classificationView } from "./classification-view.js";

const BUCKET = process.env.SITEWIREAI_BUCKET ?? "";

let s3: S3Client | null = null;
function client(): S3Client {
  if (!s3) s3 = new S3Client({});
  return s3;
}

/**
 * A link the browser fetches the photo from directly.
 *
 * Presigned rather than proxied: these are multi-megabyte photographs and the
 * Lambda response cap is 6 MB, so streaming them through the function would fail
 * on exactly the large images most worth looking at. Fifteen minutes outlives any
 * page view and expires long before a copied URL could spread.
 */
async function imageUrl(imageKey: string | null | undefined): Promise<string> {
  if (!imageKey || !BUCKET) return "";
  try {
    return await getSignedUrl(
      client(),
      new GetObjectCommand({ Bucket: BUCKET, Key: `images/${imageKey}` }),
      { expiresIn: 900 },
    );
  } catch {
    return "";
  }
}

export interface ClassificationResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const HTML = "text/html; charset=utf-8";

const html = (status: number, body: string): ClassificationResponse => ({
  status,
  headers: { "content-type": HTML, "cache-control": "no-store" },
  body,
});

const redirect = (to: string): ClassificationResponse => ({
  status: 303,
  headers: { location: to, "cache-control": "no-store" },
  body: "",
});

/**
 * Builds the classification a person typed.
 *
 * Unknown trades and condition types are refused rather than stored: the
 * vocabulary is shared with the trainer and with alerting, and a value only this
 * form understands is a bug that surfaces in a report two services away.
 */
function fromForm(form: URLSearchParams): Classification | { error: string } {
  const trade = (form.get("trade") ?? "").trim();
  if (trade && !TRADES.some((t) => t.id === trade)) {
    return { error: `Unknown trade: ${trade}` };
  }

  const conditions = CONDITION_TYPES.flatMap((type) => {
    if (form.get(`condition.${type.id}`) !== "on") return [];
    const severity = (form.get(`severity.${type.id}`) ?? "").trim();
    return [
      {
        type: type.id,
        severity: (isSeverity(severity) ? severity : "warning") as Severity,
        note: (form.get(`note.${type.id}`) ?? "").slice(0, 500),
      },
    ];
  });

  return {
    trade,
    scopeDescription: (form.get("scopeDescription") ?? "").slice(0, 500),
    conditions,
    recommendation: (form.get("recommendation") ?? "").slice(0, 2000),
    // A person is not a fraction sure; a number here would read as a model score.
    confidence: 0,
    reading: (form.get("reading") ?? "").slice(0, 4000),
    model: HAND_CLASSIFIED,
    classifiedAt: new Date().toISOString(),
  };
}

/**
 * Handles `/captures` and `/captures/<id>`, or returns null when the path is not
 * ours so the caller can carry on routing.
 */
export async function handleClassifications(
  path: string,
  method: string,
  rawQuery: string,
  body: string,
  orgId: string | null,
): Promise<ClassificationResponse | null> {
  if (path !== "/captures" && !path.startsWith("/captures/")) return null;
  if (!orgId) return redirect("/login");

  const message = new URLSearchParams(rawQuery).get("msg") ?? "";

  if (path === "/captures") {
    const captures = await db.listCaptures(orgId);
    const withImages: CaptureWithImage[] = await Promise.all(
      captures.map(async (c) => ({ ...c, imageUrl: await imageUrl(c.imageKey) })),
    );
    return html(200, classificationsView(withImages, message));
  }

  const id = decodeURIComponent(path.slice("/captures/".length));
  // Scoped read. Another tenant's id simply is not in this partition.
  const capture = (await db.listCaptures(orgId)).find((c) => c.id === id);
  if (!capture) return html(404, classificationsView([], "No such capture."));

  if (method === "POST") {
    const built = fromForm(new URLSearchParams(body));
    if ("error" in built) {
      const keep = new URLSearchParams(rawQuery);
      keep.set("msg", built.error);
      return redirect(`/captures/${encodeURIComponent(id)}?${keep}`);
    }

    // Written through `putItem` with the org as the partition key, so an
    // adjustment cannot land on a capture the caller does not own.
    await db.putItem(orgId, "CAPTURE", capture.id, {
      projectId: capture.projectId,
      area: capture.area,
      capturedAt: capture.capturedAt,
      capturedBy: capture.capturedBy,
      origin: capture.origin,
      imageKey: capture.imageKey,
      classification: built,
    });

    const keep = new URLSearchParams(rawQuery);
    keep.set("msg", "Adjustment saved.");
    return redirect(`/captures/${encodeURIComponent(id)}?${keep}`);
  }

  return html(
    200,
    classificationView({ ...capture, imageUrl: await imageUrl(capture.imageKey) }, message, rawQuery),
  );
}
