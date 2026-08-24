/**
 * Reconciliation: quantity ⋈ labour hours ⋈ bid rate → productivity factor.
 *
 * This is the arithmetic the whole product hangs off (technical plan §2), so the
 * rules that make it trustworthy live here rather than in the renderer:
 *
 *   - abstained estimates contribute nothing, and are not read as zero quantity
 *   - hours with normalization flags are excluded, not silently joined (§11)
 *   - quantity is joined to hours on the capture's own date, so two days of
 *     installed work can never be credited against one day of labour
 *   - a scope item with hours but no measurable quantity yields no factor at all,
 *     because 0 / h looks like catastrophic productivity rather than missing data
 */

import type {
  Alert,
  Capture,
  Condition,
  LabourHoursRecord,
  ProductivityFactor,
  QuantityEstimate,
  ScopeItem,
} from "./types.js";

/** Hours that may participate in a join. Flagged records are held back. */
export function isJoinableHours(record: LabourHoursRecord): boolean {
  return record.scopeItemId !== null && record.normalizationFlags.length === 0;
}

/** Estimates that carry a usable quantity. Abstention is absence, not zero. */
export function isCountableEstimate(estimate: QuantityEstimate): boolean {
  return !estimate.abstained;
}

export interface ReconcileInput {
  scopeItems: ScopeItem[];
  captures: Capture[];
  estimates: QuantityEstimate[];
  hours: LabourHoursRecord[];
}

const keyOf = (scopeItemId: string, date: string) => `${scopeItemId}|${date}`;

/**
 * One factor per scope item per date. Returns nothing for a scope item whose
 * quantity or hours are missing on that date — a gap is reported as a gap.
 */
export function reconcile(input: ReconcileInput): ProductivityFactor[] {
  const scopeById = new Map(input.scopeItems.map((s) => [s.id, s]));
  const captureDate = new Map(input.captures.map((c) => [c.id, c.capturedAt]));

  // Hours first: they define which (scope item, date) cells can hold a factor.
  const hoursByKey = new Map<string, number>();
  for (const record of input.hours) {
    if (!isJoinableHours(record)) continue;
    const key = keyOf(record.scopeItemId as string, record.date);
    hoursByKey.set(key, (hoursByKey.get(key) ?? 0) + record.hours);
  }

  // Quantity is attributed to the date its capture was taken. An estimate whose
  // capture date has no matching hours simply does not land anywhere.
  const quantityByKey = new Map<string, number>();
  for (const estimate of input.estimates) {
    if (!isCountableEstimate(estimate)) continue;
    const date = captureDate.get(estimate.captureId);
    if (date === undefined) continue;
    const key = keyOf(estimate.scopeItemId, date);
    if (!hoursByKey.has(key)) continue;
    quantityByKey.set(key, (quantityByKey.get(key) ?? 0) + estimate.estimatedQuantity);
  }

  const factors: ProductivityFactor[] = [];
  for (const [key, hours] of hoursByKey) {
    const quantity = quantityByKey.get(key);
    if (quantity === undefined || hours <= 0) continue;

    const [scopeItemId = "", date = ""] = key.split("|");
    const scope = scopeById.get(scopeItemId);
    if (!scope || scope.budgetedUnitsPerHour <= 0) continue;

    const actualRate = quantity / hours;
    factors.push({
      scopeItemId,
      date,
      installedQuantity: quantity,
      hours,
      budgetedRate: scope.budgetedUnitsPerHour,
      actualRate,
      factor: actualRate / scope.budgetedUnitsPerHour,
    });
  }

  return factors.sort((a, b) => a.date.localeCompare(b.date));
}

/** Below this, the scope item is installing slower than bid by enough to matter. */
const DRIFT_THRESHOLD = 0.85;
const CRITICAL_THRESHOLD = 0.7;

/**
 * Drift detection with correlated conditions attached.
 *
 * The conditions are what make an alert actionable — "productivity dropped" is a
 * number, "productivity dropped and access was blocked on the same captures" is a
 * claim a PM can act on and an adjudicator can read (§2, §6).
 */
export function detectDrift(
  factors: ProductivityFactor[],
  scopeItems: ScopeItem[],
  conditions: Condition[],
  conditionCaptureScope: Map<string, string>,
): Alert[] {
  const scopeById = new Map(scopeItems.map((s) => [s.id, s]));
  const alerts: Alert[] = [];

  for (const factor of factors) {
    if (factor.factor >= DRIFT_THRESHOLD) continue;
    const scope = scopeById.get(factor.scopeItemId);
    if (!scope) continue;

    const correlated = conditions.filter(
      (c) => conditionCaptureScope.get(c.captureId) === factor.scopeItemId,
    );

    const shortfall = Math.round((1 - factor.factor) * 100);
    alerts.push({
      id: `alert-${factor.scopeItemId}-${factor.date}`,
      scopeItemId: factor.scopeItemId,
      severity: factor.factor < CRITICAL_THRESHOLD ? "critical" : "warning",
      message: `${scope.trade} — ${scope.description} installing ${shortfall}% below bid rate (${factor.actualRate.toFixed(2)} vs ${factor.budgetedRate.toFixed(2)} ${scope.unitOfMeasure}/hr)`,
      correlatedConditions: correlated,
      createdAt: factor.date,
    });
  }

  return alerts;
}
