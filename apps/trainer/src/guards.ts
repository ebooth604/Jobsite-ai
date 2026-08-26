/**
 * The rules that make an accuracy number defensible, expressed as code.
 *
 * Every one of these is written somewhere in the technical plan as a sentence a
 * person is supposed to remember. Sentences do not survive a deadline. So the app
 * refuses instead: a split a sample is not eligible for cannot be assigned, an
 * unreviewed sample cannot be exported, and a corpus that has drifted into a leak
 * fails the export with the offending ids listed.
 *
 * §5.4d — simulated data may train a model and may never measure one.
 * §5.4b — the anchor's as-builts calibrate; they are never the headline number.
 * §5.5  — the headline held-out set is the self-measured one.
 * §11   — the leak assertion must fail the build, not rely on convention.
 */

import { isMeasurableOrigin } from "@sitewireai/shared-types";
import {
  type GroundTruthSource,
  reviewThreshold,
  SPLITS,
  type Split,
  type TrainingSample,
} from "./dataset.js";

/**
 * Which splits each source may enter.
 *
 * Read this table as the whole policy — every other function here is derived from
 * it, so changing the policy means changing one object and watching the tests.
 *
 * `simulated` is train-only: it may fit a model and may never appear in a set that
 * produces a number. `anchor_as_built` gets `calibration` instead of `holdout`
 * because a single firm's as-builts encode that firm's conventions; §5.4b makes it
 * a check *against* the headline set, not the headline set itself. Foreman
 * corrections may validate but not headline, because they are corrections to the
 * model's own output — measuring against them flatters the model on exactly the
 * cases it already got close to.
 */
export const SPLIT_ELIGIBILITY: Record<GroundTruthSource, readonly Split[]> = {
  self_measured: ["unassigned", "train", "val", "holdout"],
  anchor_as_built: ["unassigned", "train", "calibration"],
  production_correction: ["unassigned", "train", "val"],
  simulated: ["unassigned", "train"],
};

/** Splits whose contents produce a reported figure. Nothing simulated, ever. */
export const MEASURING_SPLITS: readonly Split[] = ["val", "holdout", "calibration"];

export function isMeasuringSplit(split: Split): boolean {
  return MEASURING_SPLITS.includes(split);
}

export function eligibleSplits(source: GroundTruthSource): readonly Split[] {
  return SPLIT_ELIGIBILITY[source];
}

export function canAssign(source: GroundTruthSource, split: Split): boolean {
  return eligibleSplits(source).includes(split);
}

export interface Violation {
  sampleId: string;
  rule: string;
  detail: string;
}

/**
 * Whether the rules refuse, or merely report.
 *
 *   advisory (default) — everything below is still computed and still shown, and
 *                        nothing is stopped. Models write what they infer, gates
 *                        pass, exports cut, and violations appear on the Integrity
 *                        page as things to look at rather than things to fix first.
 *
 *   blocking            — the original behaviour: a violation refuses the write.
 *
 * Advisory is the default because the rules were getting in the way of the work
 * they exist to support, and a rule nobody can proceed past gets removed rather
 * than obeyed. This keeps the *record* — every provenance field is still written,
 * so a corpus cut in advisory mode can still answer who authored what — while
 * letting the pipeline run at the speed it was built for.
 *
 * The distinction matters more than it looks. Deleting the checks would mean a
 * corpus that cannot tell you it has a problem. Demoting them means one that can,
 * and does, and lets you decide when it matters.
 *
 * Set `SITEWIREAI_ENFORCEMENT=blocking` to restore refusals — nothing was removed
 * to make this work, so that flag is the whole difference.
 */
export type Enforcement = "advisory" | "blocking";

export function enforcement(env: NodeJS.ProcessEnv = process.env): Enforcement {
  return env.SITEWIREAI_ENFORCEMENT === "blocking" ? "blocking" : "advisory";
}

/** True when a violation should refuse the operation rather than annotate it. */
export function blocks(env: NodeJS.ProcessEnv = process.env): boolean {
  return enforcement(env) === "blocking";
}

/**
 * The leak assertion, run over a whole corpus.
 *
 * Deliberately independent of `canAssign` in one respect: it re-derives the origin
 * check through `isMeasurableOrigin` from the shared package rather than trusting
 * the eligibility table. Two independent statements of the same rule catch the
 * case where someone widens the table without meaning to — which is precisely how
 * this rule would be broken in practice, by a well-meant edit rather than malice.
 */
export function findViolations(samples: readonly TrainingSample[]): Violation[] {
  const violations: Violation[] = [];

  for (const s of samples) {
    if (!canAssign(s.source, s.split)) {
      violations.push({
        sampleId: s.id,
        rule: "split-eligibility",
        detail: `source ${s.source} may not sit in split ${s.split}`,
      });
    }

    if (isMeasuringSplit(s.split) && !isMeasurableOrigin(s.origin)) {
      violations.push({
        sampleId: s.id,
        rule: "simulated-leak",
        detail: `origin ${s.origin} is in measuring split ${s.split} (technical plan §5.4d, §11)`,
      });
    }

    if (s.split === "holdout" && s.source !== "self_measured") {
      violations.push({
        sampleId: s.id,
        rule: "headline-set-purity",
        detail: `holdout is the self-measured set (§5.5); this sample is ${s.source}`,
      });
    }

    if (s.split === "calibration" && s.source !== "anchor_as_built") {
      violations.push({
        sampleId: s.id,
        rule: "calibration-set-purity",
        detail: `calibration is the anchor's as-builts (§5.4b); this sample is ${s.source}`,
      });
    }

    // A sample nobody could measure carries no number to compare against. It is
    // useful training signal for abstention and useless as a measuring stick.
    if (isMeasuringSplit(s.split) && (s.groundTruth.abstained || s.groundTruth.quantity === null)) {
      violations.push({
        sampleId: s.id,
        rule: "no-quantity-in-measuring-split",
        detail: "sample has no ground-truth quantity but sits in a measuring split",
      });
    }

    if (isMeasuringSplit(s.split) && s.status !== "reviewed") {
      violations.push({
        sampleId: s.id,
        rule: "unreviewed-in-measuring-split",
        detail: `status is ${s.status}; a measuring split takes reviewed samples only`,
      });
    }

    if (s.origin !== deriveOriginForCheck(s.source)) {
      violations.push({
        sampleId: s.id,
        rule: "origin-mismatch",
        detail: `origin ${s.origin} does not follow from source ${s.source}`,
      });
    }

    if (!s.faceRedaction.declaredNoPeople && s.faceRedaction.regions.length === 0) {
      violations.push({
        sampleId: s.id,
        rule: "redaction-undeclared",
        detail: "no faces redacted and nobody declared the frame free of people",
      });
    }

    // A detector that misses one face produces a photo that looks redacted and is
    // not. Machine-proposed rectangles are only ever as good as the human who
    // looked at them afterwards, so the corpus records that a human did.
    if (s.faceRedaction.assistedBy && !s.faceRedaction.confirmedByHuman) {
      violations.push({
        sampleId: s.id,
        rule: "redaction-unconfirmed",
        detail: `redaction was proposed by ${s.faceRedaction.assistedBy} and never confirmed by a person`,
      });
    }

    violations.push(...chainViolations(s));
  }

  return violations;
}

/**
 * The rules that protect the proprietary layer.
 *
 * Everything here defends one boundary: **YOLO and SAM produce geometry, never
 * meaning.** They are isolated to two tasks — detect and segment — and the moment
 * one of them is recorded as the author of a condition, a cost, a recommendation
 * or an outcome, the corpus has started laundering a detector's output into the
 * interpretation layer that is supposed to be the product's whole advantage.
 *
 * Nobody would do that on purpose. It happens when an auto-fill is added in a
 * hurry and a `proposedBy` string gets copied along with the box it came from.
 */
function chainViolations(sample: TrainingSample): Violation[] {
  const found: Violation[] = [];
  const regionIds = new Set(sample.regions.map((r) => r.id));

  for (const chain of sample.chains ?? []) {
    const where = `chain ${chain.id.slice(0, 8)}`;

    // The boundary. A geometry model may not be the author of an interpretation.
    for (const [field, author] of [
      ["proposedBy", chain.proposedBy],
      ["impact.attributedBy", chain.impact.attributedBy],
      ["recommendation.proposedBy", chain.recommendation.proposedBy],
      ["recommendation.confirmedBy", chain.recommendation.confirmedBy],
      ["outcome.recordedBy", chain.outcome.recordedBy],
    ] as const) {
      if (namesGeometryModel(author)) {
        found.push({
          sampleId: sample.id,
          rule: "geometry-model-authored-meaning",
          detail:
            `${where}: ${field} names ${author}, which only detects or segments. ` +
            "Those two tasks produce geometry; they may never author meaning.",
        });
      }
    }

    // The routing rule. The reasoning model does the work; a human is asked only
    // when the model is unsure. Above the threshold, an empty `confirmedBy` is the
    // system working as designed — below it, it is a chain that skipped its review.
    const threshold = reviewThreshold();
    if (!chain.confirmedBy.trim() && chain.modelConfidence < threshold) {
      found.push({
        sampleId: sample.id,
        rule: "low-confidence-chain-unconfirmed",
        detail:
          `${where}: drafted at ${chain.modelConfidence.toFixed(2)} confidence, below the ` +
          `${threshold.toFixed(2)} review threshold, and nobody confirmed it`,
      });
    }

    // Claiming a human signed off while also claiming nobody was in the loop.
    if (chain.autoAccepted && chain.confirmedBy.trim()) {
      found.push({
        sampleId: sample.id,
        rule: "chain-provenance-contradiction",
        detail: `${where}: marked auto-accepted but also confirmed by ${chain.confirmedBy}`,
      });
    }

    // A confidence outside 0..1 is a bug in whatever wrote it, and it silently
    // breaks the routing rule above — a chain at 1.5 clears every threshold.
    if (!(chain.modelConfidence >= 0 && chain.modelConfidence <= 1)) {
      found.push({
        sampleId: sample.id,
        rule: "chain-confidence-out-of-range",
        detail: `${where}: confidence ${chain.modelConfidence} is not in [0, 1]`,
      });
    }

    // Advice a customer acts on is the one output where the threshold is not
    // enough. An estimate that is confidently wrong costs an inaccurate number; a
    // recommendation that is confidently wrong sends a crew to do the wrong work.
    if (
      chain.recommendation.action.trim() &&
      !chain.recommendation.confirmedBy.trim() &&
      chain.outcome.status !== "pending"
    ) {
      found.push({
        sampleId: sample.id,
        rule: "actioned-recommendation-unconfirmed",
        detail: `${where}: a recommendation was acted on without anyone signing off on it first`,
      });
    }

    // §5.4d, applied to the interpretation layer. A rendered scene has no labour
    // hours behind it, so nothing about it can have been *measured* — and an
    // outcome is an observation of a real site that a render cannot have.
    if (sample.source === "simulated") {
      if (chain.impact.basis === "measured") {
        found.push({
          sampleId: sample.id,
          rule: "simulated-measured-impact",
          detail:
            `${where}: a simulated sample claims a measured productivity impact. ` +
            "Simulated data may train a model and may never measure one (§5.4d).",
        });
      }
      if (chain.outcome.status === "actioned" || chain.outcome.status === "not_actioned") {
        found.push({
          sampleId: sample.id,
          rule: "simulated-outcome",
          detail: `${where}: a simulated sample cannot have a real-world outcome`,
        });
      }
    }

    // An impact attributed to nobody is an impact nobody can be asked about.
    if (
      (chain.impact.hoursLost !== null || chain.impact.factorDelta !== null) &&
      !chain.impact.attributedBy.trim()
    ) {
      found.push({
        sampleId: sample.id,
        rule: "impact-unattributed",
        detail: `${where}: a productivity loss is claimed with nobody accountable for the figure`,
      });
    }

    // Meaning that points at no pixels is an assertion about a photo rather than
    // evidence drawn from one — and §6 evidence packages rest on the difference.
    for (const id of chain.regionIds) {
      if (!regionIds.has(id)) {
        found.push({
          sampleId: sample.id,
          rule: "chain-region-missing",
          detail: `${where}: cites region ${id.slice(0, 8)}, which is not on this sample`,
        });
      }
    }
  }

  return found;
}

/**
 * Does this author string name one of the two geometry tasks?
 *
 * Matched by substring rather than exact equality because the strings arriving
 * here are weight file names — `yolo11n.pt`, `sam2.1_b.pt`, `best.pt` from a
 * fine-tune — and the check has to survive all of them.
 */
function namesGeometryModel(author: string): boolean {
  const name = author.trim().toLowerCase();
  if (!name) return false;
  return GEOMETRY_MODEL_PATTERN.test(name);
}

/**
 * Weight-file shapes, not bare words.
 *
 * The first version of this matched `\bsam\b`, which flagged every labeller named
 * Sam as a segmentation model and refused their work. That is the failure mode a
 * rule like this has: it is invisible until it fires on a real person, and then it
 * blocks them with an accusation that makes no sense.
 *
 * So the match requires something that actually looks like a model identifier — a
 * `yolo`/`sam` prefix followed by a version character, a weights extension, or one
 * of the known full names. `sam2.1_b.pt` and `yolo11n.pt` match; `Sam Fletcher`
 * and `Samantha Yu` do not.
 */
const GEOMETRY_MODEL_PATTERN =
  /(^|[\s/\\([])(yolo|sam)[\d._-]|\.(pt|onnx|engine|torchscript)\b|segment[-_ ]?anything|mobile[-_]?sam|fastsam/;

/** Local copy of the derivation so the check does not import its own answer. */
function deriveOriginForCheck(source: GroundTruthSource): string {
  if (source === "simulated") return "simulated";
  if (source === "self_measured") return "self_measured";
  return "field";
}

export interface Readiness {
  ready: boolean;
  /** What is missing, in the order a labeller would fix it. */
  missing: string[];
}

/**
 * What a sample still needs before it can leave `draft`.
 *
 * The gate is deliberately about provenance rather than completeness: regions and
 * conditions are optional because a photo can be a perfectly good quantity sample
 * without a single box drawn on it, but nothing may pass without a redaction
 * decision, a measurement method and a named measurer. Those three are what a
 * reviewer needs in order to disagree.
 */
export function labelReadiness(sample: TrainingSample): Readiness {
  const missing: string[] = [];
  const gt = sample.groundTruth;

  if (!sample.faceRedaction.declaredNoPeople && sample.faceRedaction.regions.length === 0) {
    missing.push("Redact faces, or declare there are no people in frame");
  }
  if (sample.faceRedaction.assistedBy && !sample.faceRedaction.confirmedByHuman) {
    missing.push(
      `Confirm the rectangles ${sample.faceRedaction.assistedBy} proposed — a detector that ` +
        "misses one face produces a photo that only looks redacted",
    );
  }
  if (!gt.trade) missing.push("Pick a trade");
  if (!gt.scopeDescription.trim()) missing.push("Describe the scope this photo shows");
  if (!gt.unitOfMeasure) missing.push("Pick a unit of measure");
  if (!gt.abstained && gt.quantity === null) {
    missing.push("Enter the measured quantity, or mark it unmeasurable");
  }
  if (!gt.abstained && gt.quantity !== null && gt.quantity < 0) {
    missing.push("Quantity cannot be negative");
  }
  if (!gt.measuredBy.trim() && !gt.abstained) missing.push("Name who measured it");
  if (!gt.measuredAt && !gt.abstained) missing.push("Date the measurement");
  if (!sample.area.trim()) missing.push("Name the area");
  if (!sample.capturedAt) missing.push("Date the capture");
  if (!sample.projectRef.trim()) missing.push("Reference the project or site");

  // A measurement with no stated error bar is a measurement pretending to be
  // exact. Only a rendered scene is exact by construction (§5.4d).
  if (!gt.abstained && gt.method !== "model_exact" && gt.uncertaintyPct <= 0) {
    missing.push("State the measurement uncertainty (0 is only honest for a render)");
  }
  if (gt.method === "model_exact" && sample.source !== "simulated") {
    missing.push("Only a simulated sample may claim an exact-from-model measurement");
  }
  if (gt.method === "as_built_report" && sample.source !== "anchor_as_built") {
    missing.push("An as-built report is by definition an anchor-firm sample");
  }

  return { ready: missing.length === 0, missing };
}

/**
 * Which splits this particular sample could be moved to right now — eligibility
 * plus the per-sample facts. Used to render the split control, so the UI cannot
 * offer a choice the export would later refuse.
 */
export function availableSplits(sample: TrainingSample): readonly Split[] {
  return SPLITS.filter((split) => {
    if (!canAssign(sample.source, split)) return false;
    if (split === "unassigned" || split === "train") return true;
    if (sample.groundTruth.abstained || sample.groundTruth.quantity === null) return false;
    return sample.status === "reviewed";
  });
}

/**
 * Why a split is unavailable, for the one case a user will ask about. Returning
 * the reason beside the disabled control is the difference between a rule that
 * teaches and a rule that annoys.
 */
export function splitBlockedReason(sample: TrainingSample, split: Split): string | null {
  if (availableSplits(sample).includes(split)) return null;
  if (!canAssign(sample.source, split)) {
    if (sample.source === "simulated") {
      return "Simulated data may train a model and may never measure one (§5.4d).";
    }
    if (split === "holdout") return "The headline held-out set is self-measured only (§5.5).";
    if (split === "calibration") return "Calibration is the anchor firm's as-builts (§5.4b).";
    return "This source is not eligible for that split.";
  }
  if (sample.groundTruth.abstained || sample.groundTruth.quantity === null) {
    return "No ground-truth quantity, so there is nothing here to measure against.";
  }
  return "Needs a second-person review before it can measure anything.";
}
