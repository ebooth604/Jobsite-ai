/**
 * The productivity factor — the number this whole service exists to produce.
 *
 * Pure functions, no I/O, so the arithmetic can be tested exhaustively and
 * exercised against real bid numbers before any database exists. The join
 * itself (QuantityEstimate ⋈ LabourHoursRecord ⋈ ScopeItem) lands on top of
 * these when that work starts — technical plan §4.
 *
 * Naming follows the plan's `ProductivityFactor` entity: `factor` is
 * actual_rate / budgeted_rate, so 1.0 is on bid and below 1.0 is losing.
 */

/** Estimates below this confidence do not feed a reported factor (§5.3). */
export const DEFAULT_MIN_CONFIDENCE = 0.6;

/** A single day's factor is noise; a sustained trend is signal. */
export const DEFAULT_TREND_WINDOW_DAYS = 6;

/** Factor below which a sustained trend is worth waking someone for. */
export const DEFAULT_ALERT_BELOW_FACTOR = 0.9;

export interface ProductivityFactorInput {
  /** From ScopeItem. Units the bid assumed per hour. */
  budgetedUnitsPerHour: number;
  /** Sum of installed quantity over the window, in the scope item's unit. */
  installedQuantity: number;
  /** Crew hours booked to the scope item over the same window. */
  hours: number;
  /** From ScopeItem, for projecting the finish. Optional: crew-relative mode has no bid. */
  bidHours?: number;
}

export interface ProductivityFactorResult {
  budgetedRate: number;
  /** installedQuantity / hours. */
  actualRate: number;
  /** actualRate / budgetedRate. Below 1.0 means slower than bid. */
  factor: number;
  /** Hours the installed work would have taken at bid rate. */
  earnedHours: number;
  /** Total hours the scope consumes if the current rate holds. Needs bidHours. */
  projectedTotalHours?: number;
  /** Positive is an overrun. The number that makes an ops leader sit up. */
  projectedOverrunHours?: number;
}

/**
 * Raised when the bid cannot support a factor.
 *
 * Thrown rather than returning a sentinel: a scope item with no budgeted rate
 * yields no meaningful factor, and quietly returning 0 or Infinity would put a
 * wrong number in front of a customer. Callers fall back to crew-relative
 * trending, which is designed in from the start rather than retrofitted
 * (technical plan §13.2).
 */
export class UnusableBidError extends Error {
  override name = "UnusableBidError";
}

export function computeProductivityFactor(
  input: ProductivityFactorInput,
): ProductivityFactorResult {
  const { budgetedUnitsPerHour, installedQuantity, hours, bidHours } = input;

  if (!(budgetedUnitsPerHour > 0)) {
    throw new UnusableBidError(
      "budgetedUnitsPerHour must be > 0; fall back to crew-relative trending",
    );
  }
  if (!(hours > 0)) {
    throw new UnusableBidError("hours must be > 0; no hours booked means no factor");
  }
  if (installedQuantity < 0) {
    throw new UnusableBidError("installedQuantity cannot be negative");
  }

  const actualRate = installedQuantity / hours;
  const factor = actualRate / budgetedUnitsPerHour;
  const earnedHours = installedQuantity / budgetedUnitsPerHour;

  const result: ProductivityFactorResult = {
    budgetedRate: budgetedUnitsPerHour,
    actualRate,
    factor,
    earnedHours,
  };

  if (bidHours !== undefined && bidHours > 0) {
    // A factor of zero (nothing installed yet) projects infinite hours,
    // which is true and useless. Report it as such rather than pretending.
    const projectedTotalHours = factor > 0 ? bidHours / factor : Number.POSITIVE_INFINITY;
    result.projectedTotalHours = projectedTotalHours;
    result.projectedOverrunHours = projectedTotalHours - bidHours;
  }

  return result;
}

/** The fields of a QuantityEstimate (plus its Correction) that the window needs. */
export interface ScoreableEstimate {
  estimatedQuantity: number;
  confidence: number;
  abstained: boolean;
  /** From the Correction entity. Ground truth when a foreman has edited. */
  correctedQuantity?: number;
}

export interface TrendOptions {
  windowDays?: number;
  minConfidence?: number;
  alertBelowFactor?: number;
}

export interface WindowAssessment {
  /** Estimates that counted toward the total. */
  usedCount: number;
  /** Dropped for abstention or low confidence. High values mean bad capture. */
  excludedCount: number;
  installedQuantity: number;
  /** False when there is not enough trustworthy data to say anything. */
  hasEnoughSignal: boolean;
}

/**
 * Reduce a window of estimates to the quantity that may feed a factor.
 *
 * Abstentions and low-confidence estimates are excluded rather than treated as
 * zero. A model that declined to answer has not told us no work happened, and
 * counting silence as zero would manufacture a false productivity collapse —
 * the most damaging possible false positive, since it would have a PM chasing
 * a crew that was working fine.
 */
export function assessWindow(
  estimates: readonly ScoreableEstimate[],
  options: TrendOptions = {},
): WindowAssessment {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const windowDays = options.windowDays ?? DEFAULT_TREND_WINDOW_DAYS;

  let installedQuantity = 0;
  let usedCount = 0;
  let excludedCount = 0;

  for (const estimate of estimates) {
    // A correction is ground truth and bypasses the confidence gate.
    if (estimate.correctedQuantity !== undefined) {
      installedQuantity += estimate.correctedQuantity;
      usedCount += 1;
      continue;
    }
    if (estimate.abstained || estimate.confidence < minConfidence) {
      excludedCount += 1;
      continue;
    }
    installedQuantity += estimate.estimatedQuantity;
    usedCount += 1;
  }

  return {
    usedCount,
    excludedCount,
    installedQuantity,
    hasEnoughSignal: usedCount >= Math.ceil(windowDays / 2),
  };
}

export interface DriftAlert {
  scopeItemId: string;
  factor: number;
  projectedOverrunHours: number | undefined;
  observedDays: number;
  since: string;
}

/**
 * Decide whether a window warrants an Alert.
 *
 * Returns null far more often than not, deliberately. An alert that cries wolf
 * twice is an alert the PM mutes forever, and a muted alert is a cancelled
 * subscription six months later.
 */
export function detectDrift(
  scopeItemId: string,
  scope: { budgetedUnitsPerHour: number; bidHours?: number },
  estimates: readonly ScoreableEstimate[],
  hours: number,
  since: string,
  options: TrendOptions = {},
): DriftAlert | null {
  const alertBelowFactor = options.alertBelowFactor ?? DEFAULT_ALERT_BELOW_FACTOR;
  const assessment = assessWindow(estimates, options);

  if (!assessment.hasEnoughSignal || hours <= 0) {
    return null;
  }

  let result: ProductivityFactorResult;
  try {
    result = computeProductivityFactor({
      budgetedUnitsPerHour: scope.budgetedUnitsPerHour,
      installedQuantity: assessment.installedQuantity,
      hours,
      ...(scope.bidHours !== undefined ? { bidHours: scope.bidHours } : {}),
    });
  } catch {
    // An unusable bid is not an alert condition — crew-relative trending
    // handles that case upstream.
    return null;
  }

  if (result.factor >= alertBelowFactor) {
    return null;
  }

  return {
    scopeItemId,
    factor: result.factor,
    projectedOverrunHours: result.projectedOverrunHours,
    observedDays: assessment.usedCount,
    since,
  };
}
