/**
 * The data model, after the simplification.
 *
 * This app used to be a training-corpus builder: four ground-truth sources, five
 * splits, measured quantities with error bars, a leak rule that failed the build,
 * and an export that cut manifests and dataset cards. All of that existed to make
 * a *self-trained* model's accuracy number defensible.
 *
 * We no longer train a model. Classification comes from a hosted frontier model
 * on every photo, so there is no corpus to keep honest and nothing to hold out.
 * What remains is the smallest thing that is still useful: a photo, where it came
 * from, and what the model made of it.
 *
 * Deliberately gone, and why, so nobody re-adds them by reflex:
 *   - splits / ground-truth sources / the simulated-leak rule — no training run
 *   - measured quantity, unit, method, uncertainty — nothing consumes them
 *   - regions and segmentation outlines — annotation for a trainer that is gone
 *   - face redaction — dropped by decision; see the note in `store.ts`
 */

/** Trades. Unchanged from the training build — the vocabulary is still right. */
export const TRADES: readonly { id: string; label: string }[] = [
  { id: "electrical_rough_in", label: "Electrical rough-in" },
  { id: "concrete_forming", label: "Concrete forming" },
  { id: "drywall", label: "Drywall" },
  { id: "framing", label: "Framing" },
];

/**
 * Condition vocabulary.
 *
 * These names match the dashboard's and the alerting service's. A condition
 * classified under one set of names and consumed under another is a bug that only
 * shows up in production, so the two lists stay in step.
 */
export const CONDITION_TYPES: readonly { id: string; label: string }[] = [
  { id: "blocked_access", label: "Blocked access" },
  { id: "stacked_trades", label: "Stacked trades" },
  { id: "damage", label: "Damage" },
  { id: "out_of_sequence", label: "Out-of-sequence work" },
  { id: "material_shortage", label: "Material shortage" },
  { id: "housekeeping", label: "Housekeeping / debris" },
];

export type Severity = "info" | "warning" | "critical";

export const SEVERITIES = ["info", "warning", "critical"] as const satisfies readonly Severity[];

export interface ConditionTag {
  type: string;
  severity: Severity;
  note: string;
}

/**
 * What the model made of one photograph.
 *
 * `model` and `classifiedAt` travel with it because "which model said this, and
 * when" is the question worth being able to answer later — particularly after a
 * model swap changes the character of the answers.
 */
/**
 * What `Classification.model` says when a person wrote it rather than a model.
 *
 * The same field carries both because the question a reader has is the same one
 * either way — who said this — and splitting it into `model` plus an
 * `authoredBy` would let the two disagree. Hand-written classifications keep
 * `confidence` at zero: a person is not 0.87 sure, and a number in that box
 * would be read as a model score.
 */
export const HAND_CLASSIFIED = "hand-classified";

export function isHandClassified(c: Classification | null): boolean {
  return c?.model === HAND_CLASSIFIED || c?.model === "hand-labelled (pre-rewrite)";
}

export interface Classification {
  trade: string;
  scopeDescription: string;
  conditions: ConditionTag[];
  recommendation: string;
  /** The model's own confidence, 0..1. Displayed, never enforced. */
  confidence: number;
  /** Prose reasoning shown next to the result. */
  reading: string;
  model: string;
  classifiedAt: string;
}

export interface Photo {
  id: string;
  /** File name under the store's `images/` directory. */
  imageFile: string;
  width: number;
  height: number;

  /**
   * The org this photo belongs to — a `clientRef` from the product's tenant
   * store, not a name typed here. Empty means unassigned, which is a real and
   * expected state: every photo uploaded before clients existed is one.
   */
  clientRef: string;

  projectRef: string;
  area: string;
  capturedAt: string;
  notes: string;

  /** Null until the model has looked at it. */
  classification: Classification | null;

  createdAt: string;
  updatedAt: string;
}

export function tradeLabel(id: string): string {
  return TRADES.find((t) => t.id === id)?.label ?? (id || "Unclassified");
}

export function conditionLabel(id: string): string {
  return CONDITION_TYPES.find((c) => c.id === id)?.label ?? id;
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && SEVERITIES.includes(value as Severity);
}

/**
 * Reads a stored record, tolerating the old training-corpus shape.
 *
 * The corpus on disk predates this rewrite: its records carry `groundTruth`,
 * `regions`, `faceRedaction`, `split` and the rest. Rather than migrate the files
 * or throw the photos away, the fields that still mean something are lifted across
 * and everything else is ignored. Old records simply appear as already-classified
 * photos, which is what they effectively are.
 */
export function parsePhoto(raw: unknown): Photo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = str(r.id);
  const imageFile = str(r.imageFile);
  if (!id || !imageFile) return null;

  const legacy = (r.groundTruth ?? {}) as Record<string, unknown>;
  const storedClassification = r.classification as Record<string, unknown> | null | undefined;

  // Current shape wins; otherwise reconstruct one from the old ground-truth
  // fields, but only when a labeller actually put something there.
  let classification: Classification | null = null;
  if (storedClassification && typeof storedClassification === "object") {
    classification = {
      trade: str(storedClassification.trade),
      scopeDescription: str(storedClassification.scopeDescription),
      conditions: parseConditions(storedClassification.conditions),
      recommendation: str(storedClassification.recommendation),
      confidence: num(storedClassification.confidence),
      reading: str(storedClassification.reading),
      model: str(storedClassification.model),
      classifiedAt: str(storedClassification.classifiedAt),
    };
  } else if (str(legacy.trade) || str(legacy.scopeDescription)) {
    classification = {
      trade: str(legacy.trade),
      scopeDescription: str(legacy.scopeDescription),
      conditions: parseConditions(r.conditions),
      recommendation: "",
      confidence: 0,
      reading: "",
      model: "hand-labelled (pre-rewrite)",
      classifiedAt: str(r.updatedAt),
    };
  }

  return {
    id,
    imageFile,
    width: num(r.width) || 0,
    height: num(r.height) || 0,
    clientRef: str(r.clientRef),
    projectRef: str(r.projectRef),
    area: str(r.area),
    capturedAt: str(r.capturedAt),
    notes: str(r.notes) || str(r.captureNotes),
    classification,
    createdAt: str(r.createdAt) || new Date().toISOString(),
    updatedAt: str(r.updatedAt) || new Date().toISOString(),
  };
}

export function parseConditions(value: unknown): ConditionTag[] {
  if (!Array.isArray(value)) return [];
  const tags: ConditionTag[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const c = raw as Record<string, unknown>;
    const type = str(c.type);
    if (!CONDITION_TYPES.some((t) => t.id === type)) continue;
    tags.push({
      type,
      severity: isSeverity(c.severity) ? c.severity : "warning",
      note: str(c.note).slice(0, 500),
    });
  }
  return tags;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
