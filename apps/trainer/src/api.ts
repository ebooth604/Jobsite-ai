/**
 * The write path.
 *
 * Everything here re-checks what the browser already checked. That is not
 * distrust of the client so much as the same reasoning the ingestion service uses
 * in the product: the capture app redacts on-device *and* the server re-checks,
 * because a client-side bug is not an acceptable failure mode for a promise made
 * in a contract. The same holds for the split rules — the editor filters the
 * options, and the server refuses the write anyway.
 *
 * Responses are JSON with plain-language `error` strings, because the only reader
 * is this app's own client code and a person watching the network tab.
 */

import {
  type ConditionChain,
  type ConditionTag,
  type Confidence,
  deriveOrigin,
  type GroundTruth,
  IMPACT_BASES,
  type ImpactBasis,
  isGroundTruthSource,
  isSampleStatus,
  isSplit,
  MEASUREMENT_METHODS,
  type MeasurementMethod,
  type Outcome,
  REGION_CLASSES,
  type RedactionRegion,
  type RegionLabel,
  reviewThreshold,
  type SampleStatus,
  type Severity,
  type Split,
  type TrainingSample,
} from "./dataset.js";
import { type ExportRequest, runExport } from "./export.js";
import { blocks, canAssign, labelReadiness, splitBlockedReason } from "./guards.js";
import { reasoningProvider } from "./reasoning.js";
import {
  deleteSample,
  extensionFor,
  findByHash,
  getSample,
  imageKey,
  listSamples,
  newId,
  putSample,
  readRaw,
  sha256,
  writeImage,
} from "./store.js";

export interface ApiResult {
  status: number;
  body: unknown;
}

const JSON_TYPE = "application/json; charset=utf-8";

export const jsonType = JSON_TYPE;

/**
 * 12 MB of decoded image. A phone photo redacted through a canvas and re-encoded
 * lands well under this; anything above it is a video frame dump or a mistake, and
 * both are better refused than quietly filling a disk.
 */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function parseRedactionRegions(value: unknown): RedactionRegion[] {
  if (!Array.isArray(value)) return [];
  const regions: RedactionRegion[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const x = num(r.x);
    const y = num(r.y);
    const w = num(r.w);
    const h = num(r.h);
    if (x === null || y === null || w === null || h === null) continue;
    regions.push({ x: clamp01(x), y: clamp01(y), w: clamp01(w), h: clamp01(h) });
  }
  return regions;
}

function parseRegions(value: unknown): RegionLabel[] {
  if (!Array.isArray(value)) return [];
  const known = new Set(REGION_CLASSES.map((c) => c.id));
  const regions: RegionLabel[] = [];

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const className = str(r.className);
    if (!known.has(className)) continue;

    const kind = r.kind === "polygon" ? "polygon" : "box";
    const points: (readonly [number, number])[] = [];
    if (Array.isArray(r.points)) {
      for (const point of r.points) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const x = num(point[0]);
        const y = num(point[1]);
        if (x === null || y === null) continue;
        points.push([clamp01(x), clamp01(y)]);
      }
    }
    // A box needs two corners and a polygon needs a triangle at minimum. Anything
    // less is a stray click, and a zero-area annotation is worse than none.
    if (kind === "box" ? points.length < 2 : points.length < 3) continue;

    regions.push({
      id: str(r.id) || newId(),
      className,
      kind,
      points: kind === "box" ? points.slice(0, 2) : points,
      note: str(r.note).slice(0, 400),
      proposedBy: str(r.proposedBy).slice(0, 120),
    });
  }
  return regions;
}

function parseConditions(value: unknown): ConditionTag[] {
  if (!Array.isArray(value)) return [];
  const severities: Severity[] = ["info", "warning", "critical"];
  const tags: ConditionTag[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const type = str(r.type);
    if (!type) continue;
    const severity = str(r.severity, "warning") as Severity;
    tags.push({
      type,
      severity: severities.includes(severity) ? severity : "warning",
      note: str(r.note).slice(0, 400),
    });
  }
  return tags;
}

/**
 * Parses the proprietary layer.
 *
 * Nothing here invents a value it was not given. Every author field arrives as
 * typed, including the ones `guards.ts` will refuse — a chain whose
 * `attributedBy` says `yolo11n.pt` is stored as it came in and then reported as a
 * violation, rather than being quietly blanked. A rule that silently repairs its
 * own violations teaches nobody anything and hides the bug that produced them.
 */
function parseChains(value: unknown): ConditionChain[] {
  if (!Array.isArray(value)) return [];
  const severities: Severity[] = ["info", "warning", "critical"];
  const confidences: Confidence[] = ["low", "medium", "high"];
  const statuses = ["pending", "actioned", "not_actioned", "unknown"] as const;
  const chains: ConditionChain[] = [];

  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const conditionType = str(r.conditionType);
    if (!conditionType) continue;

    const impactRaw = (r.impact ?? {}) as Record<string, unknown>;
    const recRaw = (r.recommendation ?? {}) as Record<string, unknown>;
    const outcomeRaw = (r.outcome ?? {}) as Record<string, unknown>;

    const severity = str(r.severity, "warning") as Severity;
    const basis = str(impactRaw.basis, "inferred") as ImpactBasis;
    const confidence = str(impactRaw.confidence, "low") as Confidence;
    const status = str(outcomeRaw.status, "pending") as Outcome["status"];

    chains.push({
      id: str(r.id) || newId(),
      conditionType,
      severity: severities.includes(severity) ? severity : "warning",
      regionIds: Array.isArray(r.regionIds)
        ? r.regionIds.filter((id): id is string => typeof id === "string").slice(0, 50)
        : [],
      proposedBy: str(r.proposedBy).slice(0, 120),
      modelConfidence: num(r.modelConfidence) ?? 0,
      confirmedBy: str(r.confirmedBy).slice(0, 120),
      autoAccepted: bool(r.autoAccepted),
      impact: {
        scopeRef: str(impactRaw.scopeRef).slice(0, 200),
        hoursLost: num(impactRaw.hoursLost),
        factorDelta: num(impactRaw.factorDelta),
        basis: IMPACT_BASES.includes(basis) ? basis : "inferred",
        confidence: confidences.includes(confidence) ? confidence : "low",
        attributedBy: str(impactRaw.attributedBy).slice(0, 120),
        note: str(impactRaw.note).slice(0, 2000),
      },
      recommendation: {
        action: str(recRaw.action).slice(0, 2000),
        proposedBy: str(recRaw.proposedBy).slice(0, 120),
        confirmedBy: str(recRaw.confirmedBy).slice(0, 120),
        note: str(recRaw.note).slice(0, 2000),
      },
      outcome: {
        status: statuses.includes(status) ? status : "pending",
        observedAt: str(outcomeRaw.observedAt).slice(0, 10),
        factorAfter: num(outcomeRaw.factorAfter),
        recordedBy: str(outcomeRaw.recordedBy).slice(0, 120),
        note: str(outcomeRaw.note).slice(0, 2000),
      },
      createdAt: str(r.createdAt) || new Date().toISOString(),
    });
  }

  return chains;
}

function parseMethod(value: unknown, fallback: MeasurementMethod): MeasurementMethod {
  const id = str(value);
  return MEASUREMENT_METHODS.some((m) => m.id === id) ? (id as MeasurementMethod) : fallback;
}

/** A blank sample's ground truth. `uncertaintyPct` starts at zero so the readiness
 *  gate forces a real answer rather than letting a default masquerade as one. */
function blankGroundTruth(): GroundTruth {
  return {
    trade: "",
    scopeDescription: "",
    unitOfMeasure: "",
    quantity: null,
    abstained: false,
    method: "direct_count",
    measuredBy: "",
    measuredAt: "",
    uncertaintyPct: 0,
    notes: "",
  };
}

export async function createSample(raw: string): Promise<ApiResult> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Body was not JSON." } };
  }

  const source = str(parsed.source);
  if (!isGroundTruthSource(source)) {
    return { status: 400, body: { error: `Unknown ground-truth source: ${source}` } };
  }

  const mime = str(parsed.mime, "image/jpeg");
  if (!extensionFor(mime)) {
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

  const redaction = (parsed.redaction ?? {}) as Record<string, unknown>;
  const regions = parseRedactionRegions(redaction.regions);
  const declaredNoPeople = bool(redaction.declaredNoPeople);
  const declaredBy = str(redaction.declaredBy).trim();
  const assistedBy = str(redaction.assistedBy).trim().slice(0, 120);
  const confirmedByHuman = bool(redaction.confirmedByHuman);

  // The gate, server-side. Advisory by default: the decision is still recorded on
  // the sample either way, so a corpus can always be asked which photos went in
  // without one.
  if (blocks() && !declaredNoPeople && regions.length === 0) {
    return {
      status: 422,
      body: {
        error:
          "Redact the faces, or declare there are no people in frame. No photo enters the " +
          "corpus without one or the other.",
      },
    };
  }
  if (blocks() && !declaredBy) {
    return { status: 422, body: { error: "Name the person making the redaction declaration." } };
  }
  // A detector proposing rectangles is a labelling accelerator, not a redaction
  // decision. It misses a face eventually, and the resulting photo looks redacted
  // and is not — so a person has to have looked.
  if (blocks() && assistedBy && !confirmedByHuman) {
    return {
      status: 422,
      body: {
        error:
          `${assistedBy} proposed these rectangles and nobody confirmed them. A detector ` +
          "that misses one face produces a photo that only looks redacted.",
      },
    };
  }

  const hash = sha256(bytes);
  const existing = findByHash(hash);
  if (existing) {
    return {
      status: 409,
      body: {
        error: "This exact photo is already in the corpus.",
        duplicateOf: existing.id,
      },
    };
  }

  const width = num(parsed.width) ?? 0;
  const height = num(parsed.height) ?? 0;
  if (width <= 0 || height <= 0) {
    return { status: 400, body: { error: "Image dimensions were missing." } };
  }

  const id = newId();
  const stored = await writeImage(id, bytes, mime);
  const now = new Date().toISOString();

  const sample: TrainingSample = {
    id,
    imageFile: stored.file,
    imageSha256: stored.sha256,
    imageBytes: stored.bytes,
    width: Math.round(width),
    height: Math.round(height),
    source,
    origin: deriveOrigin(source),
    projectRef: str(parsed.projectRef).slice(0, 200),
    area: str(parsed.area).slice(0, 200),
    capturedAt: str(parsed.capturedAt).slice(0, 10),
    captureNotes: str(parsed.captureNotes).slice(0, 2000),
    faceRedaction: {
      assistedBy,
      confirmedByHuman: assistedBy ? confirmedByHuman : true,
      declaredNoPeople,
      regions,
      declaredBy: declaredBy.slice(0, 120),
      declaredAt: now,
    },
    groundTruth: blankGroundTruth(),
    conditions: [],
    chains: [],
    regions: [],
    hardCases: [],
    split: "unassigned",
    status: "draft",
    labelledBy: declaredBy.slice(0, 120),
    reviewedBy: "",
    reviewNote: "",
    createdAt: now,
    updatedAt: now,
  };

  await putSample(sample);
  return { status: 201, body: { id, imageFile: stored.file } };
}

/**
 * Partial update.
 *
 * `source` is intentionally not updatable. Changing it would change `origin`,
 * which is the field the leak rule is written against — and a corpus where
 * provenance can be edited after the fact is a corpus whose provenance means
 * nothing. Re-intake the photo if it was filed wrongly.
 */
export async function updateSample(id: string, raw: string): Promise<ApiResult> {
  const existing = getSample(id);
  if (!existing) return { status: 404, body: { error: "No such sample." } };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return { status: 400, body: { error: "Body was not JSON." } };
  }

  const gtRaw = (parsed.groundTruth ?? {}) as Record<string, unknown>;
  const abstained = bool(gtRaw.abstained, existing.groundTruth.abstained);
  const quantityRaw = num(gtRaw.quantity);
  const groundTruth: GroundTruth = {
    trade: str(gtRaw.trade, existing.groundTruth.trade),
    scopeDescription: str(gtRaw.scopeDescription, existing.groundTruth.scopeDescription).slice(
      0,
      400,
    ),
    unitOfMeasure: str(gtRaw.unitOfMeasure, existing.groundTruth.unitOfMeasure).slice(0, 60),
    // An abstention carries no number, ever. Letting a stale quantity survive the
    // checkbox is how a "we could not measure this" sample acquires a measurement.
    quantity: abstained ? null : quantityRaw,
    abstained,
    method: parseMethod(gtRaw.method, existing.groundTruth.method),
    measuredBy: str(gtRaw.measuredBy, existing.groundTruth.measuredBy).slice(0, 120),
    measuredAt: str(gtRaw.measuredAt, existing.groundTruth.measuredAt).slice(0, 10),
    uncertaintyPct: Math.max(0, num(gtRaw.uncertaintyPct) ?? existing.groundTruth.uncertaintyPct),
    notes: str(gtRaw.notes, existing.groundTruth.notes).slice(0, 2000),
  };

  const status: SampleStatus = (() => {
    const requested = str(parsed.status);
    return isSampleStatus(requested) ? requested : existing.status;
  })();

  const split: Split = (() => {
    const requested = str(parsed.split);
    return isSplit(requested) ? requested : existing.split;
  })();

  const next: TrainingSample = {
    ...existing,
    projectRef: str(parsed.projectRef, existing.projectRef).slice(0, 200),
    area: str(parsed.area, existing.area).slice(0, 200),
    capturedAt: str(parsed.capturedAt, existing.capturedAt).slice(0, 10),
    captureNotes: str(parsed.captureNotes, existing.captureNotes).slice(0, 2000),
    groundTruth,
    conditions:
      parsed.conditions === undefined ? existing.conditions : parseConditions(parsed.conditions),
    chains: parsed.chains === undefined ? existing.chains : parseChains(parsed.chains),
    regions: parsed.regions === undefined ? existing.regions : parseRegions(parsed.regions),
    hardCases: Array.isArray(parsed.hardCases)
      ? parsed.hardCases.filter((h): h is string => typeof h === "string")
      : existing.hardCases,
    split,
    status,
    labelledBy: str(parsed.labelledBy, existing.labelledBy).slice(0, 120),
    reviewedBy: str(parsed.reviewedBy, existing.reviewedBy).slice(0, 120),
    reviewNote: str(parsed.reviewNote, existing.reviewNote).slice(0, 2000),
    updatedAt: new Date().toISOString(),
  };

  // The refusal the whole app exists to make. It is checked here rather than only
  // in the editor because the editor is one of several ways to reach this handler.
  if (blocks() && !canAssign(next.source, next.split)) {
    return {
      status: 409,
      body: {
        error:
          splitBlockedReason(next, next.split) ??
          `A ${next.source} sample may not sit in the ${next.split} split.`,
      },
    };
  }

  if (
    blocks() &&
    (next.split === "val" || next.split === "holdout" || next.split === "calibration") &&
    next.status !== "reviewed"
  ) {
    return {
      status: 409,
      body: {
        error: "A measuring split takes reviewed samples only — review it first, then assign it.",
      },
    };
  }

  if (
    blocks() &&
    (next.split === "val" || next.split === "holdout" || next.split === "calibration") &&
    (next.groundTruth.abstained || next.groundTruth.quantity === null)
  ) {
    return {
      status: 409,
      body: {
        error:
          "This sample carries no ground-truth quantity, so there is nothing for a model to " +
          "be measured against. It can train; it cannot measure.",
      },
    };
  }

  await putSample(next);
  // The readiness list travels back with the saved sample so the editor can render
  // the gate without owning a second copy of the rules. There is one implementation
  // of "what is this sample missing", and it lives in `guards.ts`.
  return {
    status: 200,
    body: { ok: true, sample: next, readiness: labelReadiness(next) },
  };
}

/**
 * Stage four: ask the reasoning model for a first pass on one sample.
 *
 * Drafts a chain and attaches it to the sample. Whether that chain needs a human
 * is decided here, once, by the same threshold `guards.ts` checks — so the routing
 * and the rule cannot drift apart.
 *
 * `attributedBy` is set to the model. That is legitimate: the reasoning model *is*
 * the interpretation layer, and only YOLO and SAM are barred from authoring
 * meaning. A number nobody owns would be the violation; a number the model owns,
 * marked `inferred`, is an honest draft waiting to be checked.
 */
export async function draftChain(id: string): Promise<ApiResult> {
  const sample = getSample(id);
  if (!sample) return { status: 404, body: { error: "No such sample." } };

  const key = imageKey(sample.imageFile);
  const bytes = key ? await readRaw(key) : null;
  if (!bytes) return { status: 409, body: { error: "That sample has no image to read." } };

  let drafted: Awaited<ReturnType<typeof reasoningProvider.draft>>;
  try {
    drafted = await reasoningProvider.draft({
      imageBase64: bytes.toString("base64"),
      trade: sample.groundTruth.trade,
      scopeDescription: sample.groundTruth.scopeDescription,
      area: sample.area,
      geometry: sample.regions.map((r) => ({ className: r.className, kind: r.kind })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Credentials, region, throttling. All the same to the caller: the first pass
    // is unavailable and the chain can still be written by hand.
    return { status: 503, body: { error: `Reasoning model unavailable — ${message}` } };
  }

  if (!drafted) {
    return {
      status: 200,
      body: {
        ok: true,
        drafted: false,
        message:
          "The model found no condition clear enough to record. That is a real answer, " +
          "not a failure — write one by hand if you disagree.",
      },
    };
  }

  const threshold = reviewThreshold();
  const needsReview = drafted.modelConfidence < threshold;

  const chain: ConditionChain = {
    id: newId(),
    conditionType: drafted.conditionType,
    severity: drafted.severity,
    regionIds: sample.regions.map((r) => r.id),
    proposedBy: drafted.model,
    modelConfidence: drafted.modelConfidence,
    confirmedBy: "",
    autoAccepted: !needsReview,
    impact: {
      scopeRef: sample.groundTruth.scopeDescription,
      hoursLost: drafted.impact.hoursLost,
      factorDelta: drafted.impact.factorDelta,
      basis: drafted.impact.basis,
      confidence:
        drafted.modelConfidence >= 0.8 ? "high" : drafted.modelConfidence >= 0.5 ? "medium" : "low",
      attributedBy: drafted.model,
      note: drafted.impact.note,
    },
    recommendation: {
      action: drafted.recommendation,
      proposedBy: drafted.model,
      confirmedBy: "",
      note: "",
    },
    outcome: {
      status: "pending",
      observedAt: "",
      factorAfter: null,
      recordedBy: "",
      note: "",
    },
    createdAt: new Date().toISOString(),
  };

  const next: TrainingSample = {
    ...sample,
    chains: [...(sample.chains ?? []), chain],
    updatedAt: new Date().toISOString(),
  };
  await putSample(next);

  return {
    status: 200,
    body: {
      ok: true,
      drafted: true,
      chain,
      needsReview,
      threshold,
      reading: drafted.reading,
    },
  };
}

/**
 * Stage four, aimed at the qualitative half of ground truth instead of a
 * condition chain: which trade, what the scope looks like, which conditions
 * and hard cases are visible. Unlike `draftChain`, nothing is written here —
 * `GroundTruth`/`ConditionTag`/`hardCases` have no `confirmedBy`-style field to
 * mark "drafted, not yet confirmed", so the draft goes back to the client and
 * the labeller's own Save (already re-checked server-side in `updateSample`)
 * is the only write path. The measured quantity and everything that backs it
 * — unit, method, measured-by/at, uncertainty — never appears in this response
 * because `reasoning.ts`'s tool schema has nowhere to put one.
 */
export async function classifySample(id: string): Promise<ApiResult> {
  const sample = getSample(id);
  if (!sample) return { status: 404, body: { error: "No such sample." } };

  const key = imageKey(sample.imageFile);
  const bytes = key ? await readRaw(key) : null;
  if (!bytes) return { status: 409, body: { error: "That sample has no image to read." } };

  let drafted: Awaited<ReturnType<typeof reasoningProvider.classify>>;
  try {
    drafted = await reasoningProvider.classify({
      imageBase64: bytes.toString("base64"),
      area: sample.area,
      geometry: sample.regions.map((r) => ({ className: r.className, kind: r.kind })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 503, body: { error: `Reasoning model unavailable — ${message}` } };
  }

  if (!drafted) {
    return {
      status: 200,
      body: {
        ok: true,
        drafted: false,
        message:
          "The model could not make out enough to suggest a classification. Fill it in by hand.",
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      drafted: true,
      model: drafted.model,
      confidence: drafted.confidence,
      reading: drafted.reading,
      suggestion: {
        trade: drafted.trade,
        scopeDescription: drafted.scopeDescription,
        conditions: drafted.conditions,
        hardCases: drafted.hardCases,
      },
    },
  };
}

/**
 * Never send more than this many photos to Bedrock from one click. The queue
 * can be worked off a page at a time rather than one button press kicking off
 * an unbounded, unattended run.
 */
const BATCH_CLASSIFY_LIMIT = 20;

export interface ClassifyQueueResult {
  classified: number;
  skipped: number;
  remaining: number;
  errors: string[];
}

/**
 * The bulk variant, run unattended from the review queue. Nobody is looking at
 * each photo the way the interactive editor's labeller is, so this writes
 * directly — but only into samples nobody has started labelling yet
 * (`groundTruth.trade` still empty), so it can never clobber a person's own
 * work in progress. Status is left exactly as it was; this fills in fields,
 * it does not mark anything reviewed.
 */
export async function classifyQueue(): Promise<ClassifyQueueResult> {
  const queue = listSamples().filter(
    (s) => (s.status === "draft" || s.status === "labelled") && !s.groundTruth.trade.trim(),
  );
  const batch = queue.slice(0, BATCH_CLASSIFY_LIMIT);

  let classified = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const sample of batch) {
    const key = imageKey(sample.imageFile);
    const bytes = key ? await readRaw(key) : null;
    if (!bytes) {
      skipped++;
      continue;
    }

    try {
      const drafted = await reasoningProvider.classify({
        imageBase64: bytes.toString("base64"),
        area: sample.area,
        geometry: sample.regions.map((r) => ({ className: r.className, kind: r.kind })),
      });

      if (!drafted || !drafted.trade) {
        skipped++;
        continue;
      }

      await putSample({
        ...sample,
        groundTruth: {
          ...sample.groundTruth,
          trade: drafted.trade,
          scopeDescription: drafted.scopeDescription || sample.groundTruth.scopeDescription,
        },
        conditions: drafted.conditions.length > 0 ? drafted.conditions : sample.conditions,
        hardCases: drafted.hardCases.length > 0 ? drafted.hardCases : sample.hardCases,
        updatedAt: new Date().toISOString(),
      });
      classified++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${sample.id.slice(0, 8)}: ${message}`);
    }
  }

  return {
    classified,
    skipped,
    remaining: Math.max(0, queue.length - batch.length),
    errors,
  };
}

export async function removeSample(id: string): Promise<ApiResult> {
  return (await deleteSample(id))
    ? { status: 200, body: { ok: true } }
    : { status: 404, body: { error: "No such sample." } };
}

/** Export is driven by a plain form post, so its input arrives urlencoded. */
export function exportFromForm(form: URLSearchParams): ExportRequest {
  const splits = form.getAll("splits").filter(isSplit);
  return {
    splits: splits.length > 0 ? splits : ["train"],
    cutBy: (form.get("cutBy") ?? "").slice(0, 120),
    note: (form.get("note") ?? "").slice(0, 400),
  };
}

export function performExport(request: ExportRequest): ReturnType<typeof runExport> {
  return runExport(listSamples(), request);
}
