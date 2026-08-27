/**
 * The trainer's own record: a photograph, where it came from, and what was made
 * of it.
 *
 * The classification vocabulary and shape are **not** defined here any more —
 * they live in `@sitewireai/classify`, because the dashboard classifies photos
 * too and a trade id that only one app understands is a bug that surfaces in the
 * other. What remains here is the part that is genuinely the trainer's: the
 * stored record, and a reader tolerant of the corpus that predates the rewrite.
 */

import {
  type Classification,
  parseConditions,
} from "@sitewireai/classify";

export {
  type Classification,
  CONDITION_TYPES,
  type ConditionTag,
  conditionLabel,
  HAND_CLASSIFIED,
  isHandClassified,
  isSeverity,
  parseConditions,
  type Severity,
  SEVERITIES,
  TRADES,
  tradeLabel,
} from "@sitewireai/classify";

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

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
