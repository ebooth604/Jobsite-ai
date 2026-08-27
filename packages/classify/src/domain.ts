/**
 * The classification vocabulary and shape, shared by every app that reads a
 * photograph.
 *
 * This lives outside both apps on purpose. The trainer classifies photos and the
 * dashboard classifies photos, and a trade or condition id that only one of them
 * understands is a bug that surfaces in the other one — in a report, in an alert,
 * or in a change-order package, long after the mismatch was introduced. One list,
 * imported twice.
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

export function tradeLabel(id: string): string {
  return TRADES.find((t) => t.id === id)?.label ?? (id || "Unclassified");
}

export function conditionLabel(id: string): string {
  return CONDITION_TYPES.find((c) => c.id === id)?.label ?? id;
}

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && SEVERITIES.includes(value as Severity);
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

