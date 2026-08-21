import { describe, expect, it } from "vitest";
import {
  assessWindow,
  computeProductivityFactor,
  detectDrift,
  type ScoreableEstimate,
  UnusableBidError,
} from "./productivity.js";

// The worked example from the business plan: 12,000 LF budgeted at 780 hours.
const BID_QUANTITY = 12_000;
const BID_HOURS = 780;
const BUDGETED_RATE = BID_QUANTITY / BID_HOURS;

function estimate(over: Partial<ScoreableEstimate> = {}): ScoreableEstimate {
  return { estimatedQuantity: 100, confidence: 0.9, abstained: false, ...over };
}

describe("computeProductivityFactor", () => {
  it("projects a ~319-hour overrun at 0.71 of bid on a 780-hour scope", () => {
    const hours = 100;
    const result = computeProductivityFactor({
      budgetedUnitsPerHour: BUDGETED_RATE,
      installedQuantity: 0.71 * hours * BUDGETED_RATE,
      hours,
      bidHours: BID_HOURS,
    });

    expect(result.factor).toBeCloseTo(0.71, 10);
    expect(result.projectedOverrunHours).toBeCloseTo(318.6, 0);
  });

  it("reports a factor of 1 and no overrun when the crew installs at bid rate", () => {
    const result = computeProductivityFactor({
      budgetedUnitsPerHour: BUDGETED_RATE,
      installedQuantity: BID_QUANTITY,
      hours: BID_HOURS,
      bidHours: BID_HOURS,
    });
    expect(result.factor).toBe(1);
    expect(result.projectedOverrunHours).toBe(0);
  });

  it("reports an underrun rather than a negative-hours absurdity when beating the bid", () => {
    const result = computeProductivityFactor({
      budgetedUnitsPerHour: BUDGETED_RATE,
      installedQuantity: BID_QUANTITY,
      hours: 600,
      bidHours: BID_HOURS,
    });
    expect(result.factor).toBeGreaterThan(1);
    expect(result.projectedOverrunHours).toBeLessThan(0);
    expect(result.projectedTotalHours).toBeGreaterThan(0);
  });

  it("omits the projection in crew-relative mode, where there is no bid to finish against", () => {
    const result = computeProductivityFactor({
      budgetedUnitsPerHour: BUDGETED_RATE,
      installedQuantity: 500,
      hours: 40,
    });
    expect(result.factor).toBeGreaterThan(0);
    expect(result.projectedTotalHours).toBeUndefined();
    expect(result.projectedOverrunHours).toBeUndefined();
  });

  it("throws on an unusable bid instead of returning a misleading number", () => {
    expect(() =>
      computeProductivityFactor({
        budgetedUnitsPerHour: 0,
        installedQuantity: 100,
        hours: 10,
      }),
    ).toThrow(UnusableBidError);

    expect(() =>
      computeProductivityFactor({
        budgetedUnitsPerHour: BUDGETED_RATE,
        installedQuantity: 100,
        hours: 0,
      }),
    ).toThrow(UnusableBidError);
  });

  it("reports an infinite projection rather than a fake zero before anything is installed", () => {
    const result = computeProductivityFactor({
      budgetedUnitsPerHour: BUDGETED_RATE,
      installedQuantity: 0,
      hours: 40,
      bidHours: BID_HOURS,
    });
    expect(result.factor).toBe(0);
    expect(result.projectedTotalHours).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("assessWindow", () => {
  it("excludes abstentions rather than counting them as zero installed", () => {
    const assessment = assessWindow([
      estimate({ estimatedQuantity: 100 }),
      estimate({ abstained: true, estimatedQuantity: 0 }),
      estimate({ estimatedQuantity: 120 }),
    ]);
    expect(assessment.installedQuantity).toBe(220);
    expect(assessment.usedCount).toBe(2);
    expect(assessment.excludedCount).toBe(1);
  });

  it("excludes low-confidence estimates", () => {
    const assessment = assessWindow([
      estimate({ estimatedQuantity: 100, confidence: 0.95 }),
      estimate({ estimatedQuantity: 900, confidence: 0.2 }),
    ]);
    expect(assessment.installedQuantity).toBe(100);
    expect(assessment.excludedCount).toBe(1);
  });

  it("treats a foreman correction as ground truth, over both estimate and confidence gate", () => {
    const assessment = assessWindow([
      estimate({ estimatedQuantity: 999, confidence: 0.1, correctedQuantity: 150 }),
    ]);
    expect(assessment.installedQuantity).toBe(150);
    expect(assessment.excludedCount).toBe(0);
  });
});

describe("detectDrift", () => {
  const scope = { budgetedUnitsPerHour: BUDGETED_RATE, bidHours: BID_HOURS };

  it("stays quiet on a single bad day", () => {
    const alert = detectDrift(
      "scope-1",
      scope,
      [estimate({ estimatedQuantity: 10 })],
      40,
      "2026-08-15",
    );
    expect(alert).toBeNull();
  });

  it("raises an alert with the projected overrun on a sustained drop below bid", () => {
    const hours = 120;
    const perDay = (0.71 * hours * BUDGETED_RATE) / 6;
    const estimates = Array.from({ length: 6 }, () => estimate({ estimatedQuantity: perDay }));

    const alert = detectDrift("scope-1", scope, estimates, hours, "2026-08-15");

    expect(alert).not.toBeNull();
    expect(alert?.factor).toBeCloseTo(0.71, 10);
    expect(alert?.projectedOverrunHours).toBeGreaterThan(300);
    expect(alert?.observedDays).toBe(6);
  });

  it("stays quiet on a crew running near bid", () => {
    const hours = 120;
    const perDay = (0.98 * hours * BUDGETED_RATE) / 6;
    const estimates = Array.from({ length: 6 }, () => estimate({ estimatedQuantity: perDay }));
    expect(detectDrift("scope-1", scope, estimates, hours, "2026-08-15")).toBeNull();
  });

  it("produces no alert from an unusable bid rather than crashing", () => {
    const estimates = Array.from({ length: 6 }, () => estimate());
    expect(
      detectDrift("scope-1", { budgetedUnitsPerHour: 0 }, estimates, 40, "2026-08-15"),
    ).toBeNull();
  });
});
