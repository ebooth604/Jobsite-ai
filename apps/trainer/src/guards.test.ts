/**
 * The leak rule, tested.
 *
 * Technical plan §11 asks for the simulated-capture leak assertion to be a test
 * that fails the build rather than a convention people remember. `shared-types`
 * holds that assertion for the product's capture path; this file holds it for the
 * corpus the models are actually trained on, which is where the leak would happen
 * first — a labeller reassigning a split at the end of a long afternoon.
 */

import { describe, expect, it } from "vitest";
import {
  type ConditionChain,
  deriveOrigin,
  type GroundTruthSource,
  type Split,
  type TrainingSample,
} from "./dataset.js";
import { availableSplits, canAssign, findViolations, labelReadiness } from "./guards.js";

function sample(overrides: Partial<TrainingSample> = {}): TrainingSample {
  const source: GroundTruthSource = overrides.source ?? "self_measured";
  const base: TrainingSample = {
    id: "11111111-1111-4111-8111-111111111111",
    imageFile: "11111111-1111-4111-8111-111111111111.jpg",
    imageSha256: "abc",
    imageBytes: 1024,
    width: 1600,
    height: 1200,
    source,
    origin: deriveOrigin(source),
    projectRef: "Kilmer L5",
    area: "L5 north corridor",
    capturedAt: "2026-08-01",
    captureNotes: "",
    faceRedaction: {
      declaredNoPeople: true,
      regions: [],
      declaredBy: "E. Booth",
      declaredAt: "2026-08-01T10:00:00.000Z",
      assistedBy: "",
      confirmedByHuman: true,
    },
    groundTruth: {
      trade: "electrical_rough_in",
      scopeDescription: "Device boxes, north wall",
      unitOfMeasure: "device boxes",
      quantity: 42,
      abstained: false,
      method: "direct_count",
      measuredBy: "E. Booth",
      measuredAt: "2026-08-01",
      uncertaintyPct: 3,
      notes: "",
    },
    conditions: [],
    chains: [],
    regions: [],
    hardCases: [],
    split: "train",
    status: "reviewed",
    labelledBy: "E. Booth",
    reviewedBy: "R. Singh",
    reviewNote: "",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  };
  return { ...base, ...overrides, source, origin: overrides.origin ?? deriveOrigin(source) };
}

describe("split eligibility", () => {
  it("lets simulated data train and nothing else", () => {
    expect(canAssign("simulated", "train")).toBe(true);
    for (const split of ["val", "holdout", "calibration"] as const) {
      expect(canAssign("simulated", split)).toBe(false);
    }
  });

  it("keeps the headline held-out set self-measured", () => {
    expect(canAssign("self_measured", "holdout")).toBe(true);
    expect(canAssign("anchor_as_built", "holdout")).toBe(false);
    expect(canAssign("production_correction", "holdout")).toBe(false);
  });

  it("gives the anchor firm calibration rather than the headline", () => {
    expect(canAssign("anchor_as_built", "calibration")).toBe(true);
    expect(canAssign("self_measured", "calibration")).toBe(false);
  });
});

describe("findViolations", () => {
  it("passes a clean corpus", () => {
    expect(findViolations([sample(), sample({ source: "simulated", split: "train" })])).toEqual([]);
  });

  it("catches a simulated sample in a measuring split", () => {
    const leaked = sample({ source: "simulated", split: "holdout" });
    const rules = findViolations([leaked]).map((v) => v.rule);
    expect(rules).toContain("simulated-leak");
  });

  it("catches an origin that no longer follows from its source", () => {
    // The shape a hand-edited JSON file takes when someone "fixes" an origin.
    const tampered = sample({ source: "simulated", origin: "field", split: "holdout" });
    const rules = findViolations([tampered]).map((v) => v.rule);
    expect(rules).toContain("origin-mismatch");
    expect(rules).toContain("headline-set-purity");
  });

  it("refuses an abstained sample in a measuring split", () => {
    const abstained = sample({
      split: "holdout",
      groundTruth: { ...sample().groundTruth, abstained: true, quantity: null },
    });
    expect(findViolations([abstained]).map((v) => v.rule)).toContain(
      "no-quantity-in-measuring-split",
    );
  });

  it("refuses an unreviewed sample in a measuring split", () => {
    const unreviewed = sample({ split: "holdout", status: "labelled" });
    expect(findViolations([unreviewed]).map((v) => v.rule)).toContain(
      "unreviewed-in-measuring-split",
    );
  });

  it("catches a photo with neither redaction nor a no-people declaration", () => {
    const undeclared = sample({
      faceRedaction: {
        declaredNoPeople: false,
        regions: [],
        declaredBy: "",
        declaredAt: "",
        assistedBy: "",
        confirmedByHuman: true,
      },
    });
    expect(findViolations([undeclared]).map((v) => v.rule)).toContain("redaction-undeclared");
  });

  it("catches machine-proposed redaction that nobody confirmed", () => {
    // The failure this exists for: a detector draws three boxes, misses a fourth
    // face, and the photo passes a gate that only counted rectangles.
    const unconfirmed = sample({
      faceRedaction: {
        declaredNoPeople: false,
        regions: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
        declaredBy: "E. Booth",
        declaredAt: "2026-08-01T10:00:00.000Z",
        assistedBy: "yolo11n.pt",
        confirmedByHuman: false,
      },
    });
    expect(findViolations([unconfirmed]).map((v) => v.rule)).toContain("redaction-unconfirmed");
    expect(labelReadiness(unconfirmed).ready).toBe(false);
  });

  it("accepts machine-proposed redaction once a human confirms it", () => {
    const confirmed = sample({
      faceRedaction: {
        declaredNoPeople: false,
        regions: [{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }],
        declaredBy: "E. Booth",
        declaredAt: "2026-08-01T10:00:00.000Z",
        assistedBy: "yolo11n.pt",
        confirmedByHuman: true,
      },
    });
    expect(findViolations([confirmed])).toEqual([]);
  });
});

/**
 * The pipeline boundary and the review threshold.
 *
 * YOLO and SAM are isolated to two tasks — detect and segment. They produce
 * geometry. The interpretation layer is the product's advantage, and these tests
 * exist so a hurried auto-fill cannot quietly launder a detector's name into it.
 */
function chain(overrides: Partial<ConditionChain> = {}): ConditionChain {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    conditionType: "stacked_trades",
    severity: "warning",
    regionIds: [],
    proposedBy: "sitewire-reasoning-v1",
    modelConfidence: 0.95,
    confirmedBy: "",
    autoAccepted: true,
    impact: {
      scopeRef: "Device boxes, north wall",
      hoursLost: 6,
      factorDelta: -0.14,
      basis: "foreman_estimate",
      confidence: "medium",
      attributedBy: "R. Singh",
      note: "",
    },
    recommendation: {
      action: "Sequence drywall behind electrical on L5.",
      proposedBy: "sitewire-reasoning-v1",
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
    createdAt: "2026-08-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("the geometry/meaning boundary", () => {
  it("refuses a detector as the author of an interpretation", () => {
    const laundered = sample({ chains: [chain({ proposedBy: "yolo11n.pt" })] });
    expect(findViolations([laundered]).map((v) => v.rule)).toContain(
      "geometry-model-authored-meaning",
    );
  });

  it("refuses a segmenter as the author of a productivity figure", () => {
    const laundered = sample({
      chains: [chain({ impact: { ...chain().impact, attributedBy: "sam2.1_b.pt" } })],
    });
    expect(findViolations([laundered]).map((v) => v.rule)).toContain(
      "geometry-model-authored-meaning",
    );
  });

  it("allows the reasoning model to author meaning", () => {
    expect(findViolations([sample({ chains: [chain()] })])).toEqual([]);
  });
  it("does not mistake a person named Sam for a segmentation model", () => {
    // The rule fired on `sam` once and refused a real labeller's work. It
    // now matches weight-file shapes, not first names.
    const human = sample({
      chains: [
        chain({
          confirmedBy: "Sam Fletcher",
          autoAccepted: false,
          impact: { ...chain().impact, attributedBy: "Sam Fletcher" },
        }),
      ],
    });
    expect(findViolations([human])).toEqual([]);
  });

  it("still catches a fine-tuned weights file as an author", () => {
    const laundered = sample({ chains: [chain({ proposedBy: "runs/site-detect/best.pt" })] });
    expect(findViolations([laundered]).map((v) => v.rule)).toContain(
      "geometry-model-authored-meaning",
    );
  });

  it("refuses a chain citing a region that is not on the sample", () => {
    const dangling = sample({ chains: [chain({ regionIds: ["no-such-region"] })] });
    expect(findViolations([dangling]).map((v) => v.rule)).toContain("chain-region-missing");
  });
});

describe("the review threshold", () => {
  it("accepts a high-confidence chain with no human confirmation", () => {
    // The design: the model does the work, humans are asked only when it is unsure.
    expect(findViolations([sample({ chains: [chain({ modelConfidence: 0.95 })] })])).toEqual([]);
  });

  it("accepts a low-confidence chain unconfirmed by default — the threshold is 0", () => {
    // Nobody needs a second person to confirm the model's draft unless a corpus
    // opts into a stricter threshold. See DEFAULT_REVIEW_THRESHOLD in dataset.ts.
    const skipped = sample({ chains: [chain({ modelConfidence: 0.4 })] });
    expect(findViolations([skipped]).map((v) => v.rule)).not.toContain(
      "low-confidence-chain-unconfirmed",
    );
  });

  it("still refuses a low-confidence chain when a corpus raises the threshold", () => {
    const original = process.env.SITEWIREAI_REVIEW_THRESHOLD;
    process.env.SITEWIREAI_REVIEW_THRESHOLD = "0.85";
    try {
      const skipped = sample({ chains: [chain({ modelConfidence: 0.4 })] });
      expect(findViolations([skipped]).map((v) => v.rule)).toContain(
        "low-confidence-chain-unconfirmed",
      );
    } finally {
      if (original === undefined) delete process.env.SITEWIREAI_REVIEW_THRESHOLD;
      else process.env.SITEWIREAI_REVIEW_THRESHOLD = original;
    }
  });

  it("accepts a low-confidence chain once a human confirms it", () => {
    const reviewed = sample({
      chains: [chain({ modelConfidence: 0.4, confirmedBy: "R. Singh", autoAccepted: false })],
    });
    expect(findViolations([reviewed])).toEqual([]);
  });

  it("refuses a chain claiming both auto-acceptance and a human sign-off", () => {
    const contradictory = sample({ chains: [chain({ confirmedBy: "R. Singh" })] });
    expect(findViolations([contradictory]).map((v) => v.rule)).toContain(
      "chain-provenance-contradiction",
    );
  });

  it("refuses a confidence outside 0..1, which would clear every threshold", () => {
    const impossible = sample({ chains: [chain({ modelConfidence: 1.5 })] });
    expect(findViolations([impossible]).map((v) => v.rule)).toContain(
      "chain-confidence-out-of-range",
    );
  });

  it("refuses a recommendation that was acted on without a sign-off", () => {
    // The one place the threshold is not enough: advice a crew actually followed.
    const acted = sample({
      chains: [
        chain({
          outcome: { ...chain().outcome, status: "actioned", recordedBy: "R. Singh" },
        }),
      ],
    });
    expect(findViolations([acted]).map((v) => v.rule)).toContain(
      "actioned-recommendation-unconfirmed",
    );
  });
});

describe("simulated data cannot carry consequence", () => {
  it("refuses a measured impact on a render", () => {
    const rendered = sample({
      source: "simulated",
      chains: [chain({ impact: { ...chain().impact, basis: "measured" } })],
    });
    expect(findViolations([rendered]).map((v) => v.rule)).toContain("simulated-measured-impact");
  });

  it("refuses a real-world outcome on a render", () => {
    const rendered = sample({
      source: "simulated",
      chains: [
        chain({
          confirmedBy: "R. Singh",
          autoAccepted: false,
          recommendation: { ...chain().recommendation, confirmedBy: "R. Singh" },
          outcome: { ...chain().outcome, status: "actioned", recordedBy: "R. Singh" },
        }),
      ],
    });
    expect(findViolations([rendered]).map((v) => v.rule)).toContain("simulated-outcome");
  });

  it("lets a render carry an inferred impact, which only trains", () => {
    const rendered = sample({
      source: "simulated",
      chains: [chain({ impact: { ...chain().impact, basis: "inferred" } })],
    });
    expect(findViolations([rendered])).toEqual([]);
  });
});

describe("availableSplits", () => {
  it("offers no measuring split until a sample is reviewed", () => {
    const drafted = sample({ status: "labelled" });
    expect(availableSplits(drafted)).toEqual<Split[]>(["unassigned", "train"]);
  });

  it("offers the held-out set once a self-measured sample is reviewed", () => {
    expect(availableSplits(sample())).toContain("holdout");
  });

  it("never offers a measuring split for simulated data, reviewed or not", () => {
    const simulated = sample({ source: "simulated", status: "reviewed" });
    expect(availableSplits(simulated)).toEqual<Split[]>(["unassigned", "train"]);
  });
});

describe("labelReadiness", () => {
  it("passes a fully labelled sample", () => {
    expect(labelReadiness(sample()).ready).toBe(true);
  });

  it("demands an error bar on anything but a render", () => {
    const noBar = sample({ groundTruth: { ...sample().groundTruth, uncertaintyPct: 0 } });
    expect(labelReadiness(noBar).missing.join(" ")).toContain("uncertainty");
  });

  it("lets a render claim an exact quantity", () => {
    const rendered = sample({
      source: "simulated",
      groundTruth: { ...sample().groundTruth, method: "model_exact", uncertaintyPct: 0 },
    });
    expect(labelReadiness(rendered).ready).toBe(true);
  });

  it("refuses an exact-from-model claim on a real photograph", () => {
    const impossible = sample({
      groundTruth: { ...sample().groundTruth, method: "model_exact" },
    });
    expect(labelReadiness(impossible).missing.join(" ")).toContain("simulated");
  });

  it("requires a redaction decision before anything else can pass", () => {
    const undeclared = sample({
      faceRedaction: {
        declaredNoPeople: false,
        regions: [],
        declaredBy: "",
        declaredAt: "",
        assistedBy: "",
        confirmedByHuman: true,
      },
    });
    expect(labelReadiness(undeclared).ready).toBe(false);
  });
});
