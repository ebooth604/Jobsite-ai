/**
 * The productivity calculation — the number the whole product exists to
 * compute and defend.
 *
 * Pure functions, no I/O, so they can be tested exhaustively. Every value
 * that reaches a customer's screen comes through here.
 */

import type { IsoDate, QuantityObservation, ScopeItem } from './types.js';

/** Alerts stay quiet below this confidence. Field software dies of false positives. */
export const DEFAULT_MIN_CONFIDENCE = 0.6;

/** A single day's factor is noise; a sustained trend is a signal. */
export const DEFAULT_TREND_WINDOW_DAYS = 6;

export interface ProductivityInput {
  scopeItem: Pick<ScopeItem, 'budgetedQuantity' | 'budgetedHours'>;
  /** Quantity installed over the window, in the scope item's unit. */
  installedQuantity: number;
  /** Actual crew hours booked to the scope item over the same window. */
  actualHours: number;
}

export interface ProductivityResult {
  /** Units the bid assumed per hour. */
  budgetedUnitsPerHour: number;
  /** Hours the installed work "should" have taken, at bid rate. */
  earnedHours: number;
  /** earnedHours / actualHours. 1.0 = on bid, below 1.0 = losing. */
  productivityFactor: number;
  /** Total hours the scope will consume if the current rate holds. */
  projectedTotalHours: number;
  /** Positive = overrun. The number that makes an ops leader sit up. */
  projectedOverrunHours: number;
}

export class InvalidScopeItemError extends Error {}

/**
 * Compute the productivity factor and projected overrun for one scope item
 * over one window.
 *
 * Throws rather than returning a sentinel when the bid is unusable: a scope
 * item with zero budgeted hours or quantity cannot produce a meaningful
 * ratio, and quietly returning 0 or Infinity would put a wrong number in
 * front of a customer. Callers should fall back to crew-relative trending.
 */
export function computeProductivity(input: ProductivityInput): ProductivityResult {
  const { budgetedQuantity, budgetedHours } = input.scopeItem;
  const { installedQuantity, actualHours } = input;

  if (budgetedHours <= 0) {
    throw new InvalidScopeItemError('budgetedHours must be > 0 to compute a productivity factor');
  }
  if (budgetedQuantity <= 0) {
    throw new InvalidScopeItemError('budgetedQuantity must be > 0 to compute a productivity factor');
  }
  if (actualHours <= 0) {
    throw new InvalidScopeItemError('actualHours must be > 0; no hours booked means no ratio');
  }
  if (installedQuantity < 0) {
    throw new InvalidScopeItemError('installedQuantity cannot be negative');
  }

  const budgetedUnitsPerHour = budgetedQuantity / budgetedHours;
  const earnedHours = installedQuantity / budgetedUnitsPerHour;
  const productivityFactor = earnedHours / actualHours;

  // A factor of zero (nothing installed yet) projects infinite hours, which
  // is technically true and useless. Report it as such rather than pretending.
  const projectedTotalHours =
    productivityFactor > 0 ? budgetedHours / productivityFactor : Number.POSITIVE_INFINITY;

  return {
    budgetedUnitsPerHour,
    earnedHours,
    productivityFactor,
    projectedTotalHours,
    projectedOverrunHours: projectedTotalHours - budgetedHours,
  };
}

export interface TrendOptions {
  windowDays?: number;
  minConfidence?: number;
  /** Factor below which a sustained trend is worth waking someone for. */
  alertBelowFactor?: number;
}

export interface TrendAssessment {
  /** Observations that actually counted toward the assessment. */
  usedObservationCount: number;
  /** Dropped for low confidence or abstention. High values mean bad capture. */
  excludedObservationCount: number;
  installedQuantity: number;
  /** False when there isn't enough trustworthy data to say anything. */
  hasEnoughSignal: boolean;
}

/**
 * Reduce a window of observations to the quantity that should feed the
 * ratio, discarding what we don't trust.
 *
 * Abstentions and low-confidence observations are excluded rather than
 * treated as zero — a model that declined to answer has not told us that no
 * work happened, and treating silence as zero would manufacture a false
 * productivity collapse.
 */
export function assessWindow(
  observations: readonly QuantityObservation[],
  options: TrendOptions = {},
): TrendAssessment {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const windowDays = options.windowDays ?? DEFAULT_TREND_WINDOW_DAYS;

  let installedQuantity = 0;
  let used = 0;
  let excluded = 0;

  for (const o of observations) {
    // A human correction is ground truth and bypasses the confidence gate.
    if (o.correctedQuantity !== undefined) {
      installedQuantity += o.correctedQuantity;
      used += 1;
      continue;
    }
    if (o.abstained || o.confidence < minConfidence) {
      excluded += 1;
      continue;
    }
    installedQuantity += o.estimatedQuantity;
    used += 1;
  }

  return {
    usedObservationCount: used,
    excludedObservationCount: excluded,
    installedQuantity,
    // Require the window to be mostly covered by trustworthy observations.
    hasEnoughSignal: used >= Math.ceil(windowDays / 2),
  };
}

export interface DriftAlert {
  scopeItemId: string;
  productivityFactor: number;
  projectedOverrunHours: number;
  observedDays: number;
  since: IsoDate;
}

/**
 * Decide whether a window warrants an alert.
 *
 * Returns null far more often than not, deliberately. An alert that cries
 * wolf twice is an alert the PM mutes forever, and a muted alert is a
 * cancelled subscription six months later.
 */
export function detectDrift(
  scopeItemId: string,
  scopeItem: Pick<ScopeItem, 'budgetedQuantity' | 'budgetedHours'>,
  observations: readonly QuantityObservation[],
  actualHours: number,
  since: IsoDate,
  options: TrendOptions = {},
): DriftAlert | null {
  const alertBelowFactor = options.alertBelowFactor ?? 0.9;
  const assessment = assessWindow(observations, options);

  if (!assessment.hasEnoughSignal || actualHours <= 0) return null;

  let result: ProductivityResult;
  try {
    result = computeProductivity({
      scopeItem,
      installedQuantity: assessment.installedQuantity,
      actualHours,
    });
  } catch {
    // An unusable bid is not an alert condition. Cold-start handling lives
    // upstream — see docs/business-plan.md, open question on bid takeoffs.
    return null;
  }

  if (result.productivityFactor >= alertBelowFactor) return null;

  return {
    scopeItemId,
    productivityFactor: result.productivityFactor,
    projectedOverrunHours: result.projectedOverrunHours,
    observedDays: assessment.usedObservationCount,
    since,
  };
}
