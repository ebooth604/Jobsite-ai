/**
 * The training-corpus data model.
 *
 * This is deliberately *not* the demo's `Capture` type. A capture is something the
 * product produced; a training sample is something a human recorded on purpose,
 * and it carries the extra fields that make an accuracy number defensible later:
 * where the ground truth came from, how it was measured, who measured it, and how
 * wrong that measurement could be.
 *
 * The field that matters most is `source`. Technical plan §5.4 names four ground
 * truth sources and §5.4d draws a hard line through them: simulated data may train
 * a model and may never measure one. Everything downstream — split eligibility,
 * export, the dataset card — is derived from that one field rather than re-decided
 * per surface, so there is exactly one place the rule can be got wrong, and it has
 * a test.
 */

import type { CaptureOrigin } from "@sitewireai/shared-types";

/**
 * The four sources from technical plan §5.4, ordered as the plan orders them: by
 * how little each depends on a customer's cooperation.
 *
 *   self_measured         (a) a trade-qualified person measured it. Primary.
 *   anchor_as_built       (b) the calibration anchor's as-built quantities.
 *   production_correction (c) a foreman corrected a live estimate.
 *   simulated             (d) rendered or procedurally generated. Training only.
 */
export type GroundTruthSource =
  | "self_measured"
  | "anchor_as_built"
  | "production_correction"
  | "simulated";

export const GROUND_TRUTH_SOURCES = [
  "self_measured",
  "anchor_as_built",
  "production_correction",
  "simulated",
] as const satisfies readonly GroundTruthSource[];

/**
 * Where a sample may be used.
 *
 *   train        — fitting. Open to every source, including simulated.
 *   val          — tuning and threshold selection. Measures, so no simulated data.
 *   holdout      — the headline accuracy number (§5.5). Self-measured only.
 *   calibration  — the anchor's as-builts, reported *alongside* holdout and never
 *                  blended into it (§5.4b).
 *   unassigned   — labelled but not yet placed. The default, because placing a
 *                  sample is the act the leak rule governs and it should be one.
 */
export type Split = "unassigned" | "train" | "val" | "holdout" | "calibration";

export const SPLITS = [
  "unassigned",
  "train",
  "val",
  "holdout",
  "calibration",
] as const satisfies readonly Split[];

/**
 * Label lifecycle. `reviewed` means a second person checked the ground truth —
 * export refuses anything less, because an unreviewed measurement inside a
 * held-out set is an accuracy claim resting on one person having a good day.
 */
export type SampleStatus = "draft" | "labelled" | "reviewed" | "rejected";

export const SAMPLE_STATUSES = [
  "draft",
  "labelled",
  "reviewed",
  "rejected",
] as const satisfies readonly SampleStatus[];

/**
 * How the quantity was arrived at. Not bookkeeping: a tape measure and a plan
 * takeoff disagree in different directions, and §13.6 wants that disagreement
 * visible rather than averaged away.
 */
export type MeasurementMethod =
  | "tape"
  | "laser"
  | "direct_count"
  | "plan_takeoff"
  | "as_built_report"
  | "model_exact";

export const MEASUREMENT_METHODS: readonly {
  id: MeasurementMethod;
  label: string;
  note: string;
}[] = [
  { id: "tape", label: "Tape measure", note: "Measured on site by hand." },
  { id: "laser", label: "Laser distance", note: "Measured on site with a laser." },
  {
    id: "direct_count",
    label: "Direct count",
    note: "Counted in the field — boxes, sheets, sticks.",
  },
  { id: "plan_takeoff", label: "Plan takeoff", note: "Read off drawings, not off the wall." },
  {
    id: "as_built_report",
    label: "As-built report",
    note: "The sub's reported quantity, in the sub's conventions.",
  },
  {
    id: "model_exact",
    label: "Exact from model",
    note: "Rendered scene — the model is the quantity.",
  },
];

/** Trades. Short on purpose: §5.1 is two trades done right, not ten averaged. */
export const TRADES: readonly { id: string; label: string; units: readonly string[] }[] = [
  {
    id: "electrical_rough_in",
    label: "Electrical rough-in",
    units: ["device boxes", "lin ft conduit", "terminations", "fixtures"],
  },
  {
    id: "concrete_forming",
    label: "Concrete forming",
    units: ["sq ft formed", "lin ft edge", "panels", "cu yd placed"],
  },
  { id: "drywall", label: "Drywall", units: ["sheets", "sq ft", "lin ft corner bead"] },
  { id: "framing", label: "Framing", units: ["lin ft", "studs", "sq ft"] },
];

/** Region classes for on-image annotation. `trade: null` means it applies to all. */
export const REGION_CLASSES: readonly { id: string; label: string; trade: string | null }[] = [
  { id: "device_box", label: "Device box", trade: "electrical_rough_in" },
  { id: "conduit_run", label: "Conduit run", trade: "electrical_rough_in" },
  { id: "panel", label: "Panel / board", trade: "electrical_rough_in" },
  { id: "form_panel", label: "Form panel", trade: "concrete_forming" },
  { id: "form_edge", label: "Formed edge", trade: "concrete_forming" },
  { id: "rebar_mat", label: "Rebar mat", trade: "concrete_forming" },
  { id: "drywall_sheet", label: "Drywall sheet", trade: "drywall" },
  { id: "stud", label: "Stud", trade: "framing" },
  { id: "opening", label: "Opening", trade: null },
  { id: "obstruction", label: "Obstruction", trade: null },
  { id: "wall_plane", label: "Wall plane", trade: null },
  { id: "out_of_scope", label: "Out of scope", trade: null },
];

/**
 * Condition types. These match the demo's vocabulary and the alerting service's,
 * because a condition head trained under one set of names and consumed under
 * another is a bug that only shows up in production.
 */
export const CONDITION_TYPES: readonly { id: string; label: string }[] = [
  { id: "blocked_access", label: "Blocked access" },
  { id: "stacked_trades", label: "Stacked trades" },
  { id: "damage", label: "Damage" },
  { id: "out_of_sequence", label: "Out-of-sequence work" },
  { id: "material_shortage", label: "Material shortage" },
  { id: "housekeeping", label: "Housekeeping / debris" },
];

/**
 * The cases where abstention behaviour is actually decided (§5.4d). Tracked as
 * first-class flags so the corpus can be audited for them — these are the
 * conditions that are expensive to wait for in the field, and a model evaluated
 * only on clean photos has not been evaluated.
 */
export const HARD_CASES: readonly { id: string; label: string }[] = [
  { id: "low_light", label: "Low light" },
  { id: "glare", label: "Glare / blown highlights" },
  { id: "occlusion", label: "Partly occluded" },
  { id: "partial_framing", label: "Scope runs out of frame" },
  { id: "dust", label: "Dust / haze" },
  { id: "oblique_angle", label: "Steep oblique angle" },
  { id: "motion_blur", label: "Motion blur" },
  { id: "clutter", label: "Heavy clutter" },
];

export type Severity = "info" | "warning" | "critical";

export interface RedactionRegion {
  /** Normalised 0..1 against the stored image, so it survives any later resize. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Face redaction record.
 *
 * The stored bytes are already mosaicked — the browser bakes redaction into the
 * image before upload, so an unredacted frame never reaches this machine's disk.
 * These regions are kept for audit: "which parts of this photo were destroyed, and
 * did a human declare there was nobody to destroy" is a question a privacy review
 * will ask, and "we didn't record it" is a poor answer.
 */
export interface FaceRedaction {
  declaredNoPeople: boolean;
  regions: RedactionRegion[];
  declaredBy: string;
  declaredAt: string;
  /**
   * The detector that proposed these rectangles, or "" when a human drew them all.
   *
   * Recorded because a privacy review asks a sharper question than "was this
   * redacted": it asks whether a person checked, or whether a model's output was
   * trusted. Those are different assurances and the corpus should be able to tell
   * them apart years later.
   */
  assistedBy: string;
  /**
   * A human looked at the proposed rectangles and accepted them.
   *
   * Required whenever `assistedBy` is set. A detector that misses one face in a
   * frame produces a photo that looks redacted and is not, and the only thing
   * standing between that and the corpus is somebody actually looking.
   */
  confirmedByHuman: boolean;
}

export interface RegionLabel {
  id: string;
  /** One of REGION_CLASSES. */
  className: string;
  kind: "box" | "polygon";
  /** Normalised 0..1 points. A box is two points: top-left, then bottom-right. */
  points: (readonly [number, number])[];
  note: string;
  /**
   * The detector that first proposed this box, or "" when a human drew it.
   *
   * A region only reaches the corpus after a labeller accepts it, so this is not a
   * trust marker — it is a bias marker. If a model turns out to have systematically
   * clipped one edge, this is what makes the affected regions findable instead of
   * a reason to distrust the whole corpus.
   */
  proposedBy: string;
}

export interface ConditionTag {
  type: string;
  severity: Severity;
  note: string;
}

/**
 * The pipeline boundary, written down.
 *
 * Two tasks are commodity and are handled by off-the-shelf models:
 *
 *   1. **Detect** — YOLO11 finds things and returns boxes.
 *   2. **Segment** — YOLO11-seg turns a box into an outline.
 *
 * Both produce *geometry*. Neither produces *meaning*. That distinction is the
 * whole architecture: anybody can run a detector, and a detector that says
 * "there is a stack of board here" is worth nothing on its own. What it costs,
 * what to do about it, and whether that worked is the part no off-the-shelf model
 * has and no competitor can download — and it is what everything below records.
 *
 * `MACHINE_GEOMETRY_TASKS` exists so the rule is enforceable rather than
 * remembered: `guards.ts` refuses any interpretation whose author is one of these.
 */
export const MACHINE_GEOMETRY_TASKS = ["detect", "segment"] as const;

export type MachineGeometryTask = (typeof MACHINE_GEOMETRY_TASKS)[number];

/**
 * Below this confidence, a drafted chain goes to a human instead of being accepted.
 *
 * Set to 0 — no confidence is ever below it, so every drafted chain auto-accepts
 * and nothing needs a second person to confirm the reasoning model's own output.
 * `confirmedBy` is still there and still gets written when a person edits or signs
 * off on a chain by hand; it is just no longer a requirement the model's draft has
 * to clear on its own. Raise this per corpus with `SITEWIREAI_REVIEW_THRESHOLD` to
 * bring the human-confirm gate back once there is a reason to distrust the model
 * at a given confidence.
 */
export const DEFAULT_REVIEW_THRESHOLD = 0;

export function reviewThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseFloat(env.SITEWIREAI_REVIEW_THRESHOLD ?? "");
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : DEFAULT_REVIEW_THRESHOLD;
}

/**
 * Even above the threshold, this share of chains is pulled for review anyway.
 *
 * Without it the threshold can never be checked. If every high-confidence chain is
 * auto-accepted and never looked at, the only evidence that 0.85 was the right line
 * is that nothing visibly broke — which is exactly what a confidently wrong model
 * looks like from the inside. Spot-checks are how the threshold earns its keep.
 */
export const SPOT_CHECK_RATE = 0.1;

/**
 * How a productivity impact was arrived at.
 *
 *   measured         — reconciled against real labour hours. The only basis that
 *                      may back a reported figure.
 *   foreman_estimate — a person on site said so. Strong signal, not a measurement.
 *   inferred         — a reasoning model proposed it and a human accepted it.
 *                      Trains; never measures.
 */
export type ImpactBasis = "measured" | "foreman_estimate" | "inferred";

export const IMPACT_BASES = [
  "measured",
  "foreman_estimate",
  "inferred",
] as const satisfies readonly ImpactBasis[];

export type Confidence = "low" | "medium" | "high";

/**
 * What a condition cost.
 *
 * Both figures are nullable and both are meant to be. A condition that visibly
 * cost something nobody quantified is still worth recording — "we saw this and
 * could not price it" is an honest row, and a corpus that only admits priced rows
 * quietly teaches the model that every condition has a known cost.
 */
export interface ProductivityImpact {
  /** Which scope the loss lands on. Free text until scope items are wired through. */
  scopeRef: string;
  hoursLost: number | null;
  /** Change in the productivity factor attributable to this condition, e.g. -0.15. */
  factorDelta: number | null;
  basis: ImpactBasis;
  confidence: Confidence;
  /** The person accountable for this number. Never a model — see `guards.ts`. */
  attributedBy: string;
  note: string;
}

/**
 * What to do about it.
 *
 * `proposedBy` may be a model. `confirmedBy` may not: a recommendation that
 * reaches a customer is advice, and advice nobody signed off on is how a product
 * tells a foreman to do something expensive and wrong.
 */
export interface Recommendation {
  /**
   * What should have been done.
   *
   * This is a *training target*, not the product's live output. The main app
   * generates recommendations at runtime with its own models; what is recorded
   * here is what the right answer turned out to be, which — paired with `Outcome`
   * below — is the supervision signal those models are fine-tuned against.
   */
  action: string;
  proposedBy: string;
  confirmedBy: string;
  note: string;
}

/**
 * What actually happened.
 *
 * This is the rarest and most valuable field in the whole corpus, and the reason
 * the chain exists. Detections are commodity, impact estimates are opinion, but
 * "we recommended this, they did it, and the factor recovered by 0.12" is a
 * closed loop — the only evidence that the recommendation was worth making.
 *
 * It cannot be filled in at labelling time, which is the point: it is written on a
 * later visit, and a corpus full of `pending` outcomes is an accurate picture of a
 * young dataset rather than a defect.
 */
export interface Outcome {
  status: "pending" | "actioned" | "not_actioned" | "unknown";
  observedAt: string;
  /** The productivity factor after the recommendation was, or was not, acted on. */
  factorAfter: number | null;
  recordedBy: string;
  note: string;
}

/**
 * One complete link from pixels to consequence.
 *
 * `regionIds` is what ties meaning back to geometry — the boxes YOLO proposed and
 * the outlines the segmenter refined. Without it, a condition is an assertion;
 * with it, it points at the pixels that justify it, which is what makes an
 * evidence package defensible (technical plan §6).
 */
export interface ConditionChain {
  id: string;
  conditionType: string;
  severity: Severity;
  /** Regions this condition is visible in. Meaning, anchored to geometry. */
  regionIds: string[];
  /** The reasoning model that drafted this chain, or "" when a human wrote it. */
  proposedBy: string;
  /**
   * The reasoning model's own confidence in this chain, 0..1.
   *
   * This is the routing signal. Above the threshold the chain is accepted as
   * drafted; below it, a human is asked. Same shape as the quantity model's
   * abstention rule (§5.3), and for the same reason: a model that hands back
   * everything it is unsure about is behaving correctly, not failing.
   */
  modelConfidence: number;
  /**
   * Who signed it off, or "" when nobody did.
   *
   * Empty is legitimate for a high-confidence chain — that is the whole point of
   * the threshold. It is a violation only below it. `guards.ts` decides.
   */
  confirmedBy: string;
  /**
   * Accepted on the model's confidence alone, with no human in the loop.
   *
   * Tracked as a first-class field rather than inferred from an empty
   * `confirmedBy`, because the share of a corpus that is unreviewed model output
   * is a number that has to be reportable. It is the same class of figure as the
   * synthetic share in §5.4d: not disqualifying, but never allowed to be invisible.
   */
  autoAccepted: boolean;
  impact: ProductivityImpact;
  recommendation: Recommendation;
  outcome: Outcome;
  createdAt: string;
}

/**
 * The measured truth for one sample.
 *
 * `quantity` is nullable and `abstained` lives here as well as in the model's
 * output: a labeller who genuinely cannot tell from the photo must be able to say
 * so. A sample nobody could measure is still worth keeping — it is signal for when
 * the model should abstain — but it can never sit in a set that measures accuracy,
 * which `guards.ts` enforces rather than documents.
 */
export interface GroundTruth {
  trade: string;
  scopeDescription: string;
  unitOfMeasure: string;
  quantity: number | null;
  abstained: boolean;
  method: MeasurementMethod;
  measuredBy: string;
  measuredAt: string;
  /** Half-width of the labeller's own error bar, in percent. Never zero by default. */
  uncertaintyPct: number;
  notes: string;
}

export interface TrainingSample {
  id: string;
  /** File name under the store's `images/` directory. Redacted bytes only. */
  imageFile: string;
  imageSha256: string;
  imageBytes: number;
  width: number;
  height: number;

  source: GroundTruthSource;
  /** Derived from `source`, never set by hand. See `deriveOrigin`. */
  origin: CaptureOrigin;

  projectRef: string;
  area: string;
  capturedAt: string;
  captureNotes: string;

  faceRedaction: FaceRedaction;
  groundTruth: GroundTruth;
  conditions: ConditionTag[];
  /**
   * The proprietary layer: condition → cost → recommendation → outcome.
   *
   * Separate from `conditions` because they answer different questions. A
   * `ConditionTag` is "this is visible here", which trains the condition head. A
   * `ConditionChain` is "this is what it cost and what we did", which is the thing
   * no dataset can be downloaded for.
   */
  chains: ConditionChain[];
  regions: RegionLabel[];
  hardCases: string[];

  split: Split;
  status: SampleStatus;
  labelledBy: string;
  reviewedBy: string;
  reviewNote: string;

  createdAt: string;
  updatedAt: string;
}

/**
 * The one mapping from source to `CaptureOrigin`.
 *
 * Both foreman corrections and the anchor's as-builts describe photographs taken
 * on a real jobsite, so both are `field`. Self-measurement keeps its own origin
 * because §5.5 makes it the headline set, and simulated keeps the origin that the
 * leak assertion in `@sitewireai/shared-types` is written against.
 */
export function deriveOrigin(source: GroundTruthSource): CaptureOrigin {
  switch (source) {
    case "self_measured":
      return "self_measured";
    case "anchor_as_built":
    case "production_correction":
      return "field";
    case "simulated":
      return "simulated";
  }
}

export const SOURCE_LABELS: Record<GroundTruthSource, string> = {
  self_measured: "Self-measured (§5.4a)",
  anchor_as_built: "Anchor as-built (§5.4b)",
  production_correction: "Production correction (§5.4c)",
  simulated: "Simulated (§5.4d)",
};

export const SPLIT_LABELS: Record<Split, string> = {
  unassigned: "Unassigned",
  train: "Train",
  val: "Validation",
  holdout: "Held-out (headline)",
  calibration: "Calibration (anchor)",
};

export function tradeLabel(id: string): string {
  return TRADES.find((t) => t.id === id)?.label ?? id;
}

export function unitsForTrade(id: string): readonly string[] {
  return TRADES.find((t) => t.id === id)?.units ?? [];
}

export function isGroundTruthSource(value: string): value is GroundTruthSource {
  return (GROUND_TRUTH_SOURCES as readonly string[]).includes(value);
}

export function isSplit(value: string): value is Split {
  return (SPLITS as readonly string[]).includes(value);
}

export function isSampleStatus(value: string): value is SampleStatus {
  return (SAMPLE_STATUSES as readonly string[]).includes(value);
}
