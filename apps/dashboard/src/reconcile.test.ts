import { isMeasurableOrigin } from "@sitewire/shared-types";
import { describe, expect, it } from "vitest";
import { detectDrift, isCountableEstimate, isJoinableHours, reconcile } from "./reconcile.js";
import {
  CAPTURES,
  CONDITION_CAPTURE_SCOPE,
  CONDITIONS,
  ESTIMATES,
  HOURS,
  SCOPE_ITEMS,
} from "./seed.js";
import type { Alert, ProductivityFactor } from "./types.js";

const factors = reconcile({
  scopeItems: SCOPE_ITEMS,
  captures: CAPTURES,
  estimates: ESTIMATES,
  hours: HOURS,
});

const alerts = detectDrift(factors, SCOPE_ITEMS, CONDITIONS, CONDITION_CAPTURE_SCOPE);

/** Narrowing helpers — a missing row should fail as a missing row, not a null deref. */
function factorFor(scopeItemId: string): ProductivityFactor {
  const found = factors.find((f) => f.scopeItemId === scopeItemId);
  if (!found) throw new Error(`no factor for ${scopeItemId}`);
  return found;
}

function alertFor(scopeItemId: string): Alert {
  const found = alerts.find((a) => a.scopeItemId === scopeItemId);
  if (!found) throw new Error(`no alert for ${scopeItemId}`);
  return found;
}

describe("demo data provenance", () => {
  // The demo is the most likely place for simulated data to be presented as if it
  // were measured, so the guarantee is asserted here rather than assumed.
  it("marks every seeded capture as simulated", () => {
    expect(CAPTURES.length).toBeGreaterThan(0);
    for (const capture of CAPTURES) {
      expect(capture.origin).toBe("simulated");
    }
  });

  it("keeps every seeded capture out of any measurable set", () => {
    for (const capture of CAPTURES) {
      expect(isMeasurableOrigin(capture.origin)).toBe(false);
    }
  });
});

describe("join guards", () => {
  it("holds back hours with an unmapped cost code", () => {
    const unmapped = HOURS.filter((h) => h.normalizationFlags.length > 0);
    expect(unmapped.length).toBeGreaterThan(0);
    for (const record of unmapped) {
      expect(isJoinableHours(record)).toBe(false);
    }
  });

  it("treats an abstention as absent, not as zero quantity", () => {
    const abstained = ESTIMATES.filter((e) => e.abstained);
    expect(abstained.length).toBeGreaterThan(0);
    for (const estimate of abstained) {
      expect(isCountableEstimate(estimate)).toBe(false);
    }
  });
});

describe("reconcile", () => {
  it("computes factor as actual rate over budgeted rate", () => {
    // 47 sheets / 8 h = 5.875/h against a 6.0/h bid rate.
    const l4 = factorFor("scope-drywall-l4");
    expect(l4.actualRate).toBeCloseTo(5.875, 3);
    expect(l4.factor).toBeCloseTo(5.875 / 6.0, 3);
  });

  it("joins quantity to hours on the capture's own date", () => {
    // cap-3 (08-18) is the only L5 capture with matching hours; cap-4 (08-19) has
    // none, so its 26 sheets must not be folded into the 08-18 factor.
    const l5 = factorFor("scope-drywall-l5");
    expect(l5.date).toBe("2026-08-18");
    expect(l5.installedQuantity).toBe(29);
  });

  it("produces no factor from flagged hours", () => {
    // hrs-4 is the only record on 2026-08-19 and it is unmapped, so that date
    // must not appear at all rather than appearing with a misleading number.
    expect(factors.some((f) => f.date === "2026-08-19")).toBe(false);
  });

  it("never emits a factor built on zero hours", () => {
    for (const factor of factors) {
      expect(factor.hours).toBeGreaterThan(0);
    }
  });
});

describe("detectDrift", () => {
  it("flags the drifting scope item", () => {
    // 29 sheets / 8 h = 3.625/h against 6.0/h — about 40% below bid.
    expect(alertFor("scope-drywall-l5").severity).toBe("critical");
  });

  it("does not flag a scope item tracking near bid", () => {
    expect(alerts.some((a) => a.scopeItemId === "scope-drywall-l4")).toBe(false);
  });

  it("attaches the correlated conditions that make an alert actionable", () => {
    const conditionTypes = alertFor("scope-drywall-l5").correlatedConditions.map(
      (c) => c.conditionType,
    );
    expect(conditionTypes).toContain("blocked_access");
  });
});
