/**
 * Corpus statistics — the page that tells you what to go photograph next.
 *
 * The useful question about a training corpus is never "how many photos do we
 * have". It is "which trade, which source, and which hard case is thin", because
 * that is the question that turns into a day of someone's work. So the counts here
 * are always broken down per trade: §5.1 builds separate models per trade with
 * separate accuracy tracking, and a corpus total averages exactly the weakness
 * that separation exists to expose.
 *
 * `syntheticShare` is a first-class figure rather than a derived curiosity. §5.4d
 * requires it to be tracked alongside `model_version` and stated on any accuracy
 * report that leaves the building — so it is computed here, per trade, and printed
 * on the dataset card at export.
 */

import {
  CONDITION_TYPES,
  type GroundTruthSource,
  HARD_CASES,
  type Split,
  TRADES,
  type TrainingSample,
  tradeLabel,
} from "./dataset.js";

export interface TradeStats {
  trade: string;
  label: string;
  total: number;
  bySplit: Record<Split, number>;
  bySource: Record<GroundTruthSource, number>;
  /** Simulated share of this trade's TRAIN split. The figure §5.4d asks for. */
  syntheticShare: number;
  reviewed: number;
  abstained: number;
  withRegions: number;
  medianUncertaintyPct: number | null;
}

export interface CorpusStats {
  total: number;
  byTrade: TradeStats[];
  conditionCoverage: { id: string; label: string; count: number }[];
  hardCaseCoverage: { id: string; label: string; count: number }[];
  /** Whole-corpus split counts, for the header tiles. */
  bySplit: Record<Split, number>;
  gaps: Gap[];
}

export interface Gap {
  severity: "info" | "warning" | "critical";
  headline: string;
  detail: string;
}

function emptySplitCounts(): Record<Split, number> {
  return { unassigned: 0, train: 0, val: 0, holdout: 0, calibration: 0 };
}

function emptySourceCounts(): Record<GroundTruthSource, number> {
  return { self_measured: 0, anchor_as_built: 0, production_correction: 0, simulated: 0 };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  return lo === undefined || hi === undefined ? null : (lo + hi) / 2;
}

export function corpusStats(samples: readonly TrainingSample[]): CorpusStats {
  const live = samples.filter((s) => s.status !== "rejected");
  const bySplit = emptySplitCounts();
  for (const s of live) bySplit[s.split] += 1;

  // Trades present in the corpus but absent from the taxonomy still get a row —
  // a hand-edited JSON file is a supported way to work here, and silently
  // dropping its samples from the counts would be the worst kind of wrong.
  const tradeIds = new Set<string>(TRADES.map((t) => t.id));
  for (const s of live) tradeIds.add(s.groundTruth.trade);

  const byTrade: TradeStats[] = [...tradeIds]
    .map((trade) => {
      const rows = live.filter((s) => s.groundTruth.trade === trade);
      const splitCounts = emptySplitCounts();
      const sourceCounts = emptySourceCounts();
      for (const s of rows) {
        splitCounts[s.split] += 1;
        sourceCounts[s.source] += 1;
      }
      const train = rows.filter((s) => s.split === "train");
      const simulatedTrain = train.filter((s) => s.source === "simulated").length;

      return {
        trade,
        label: tradeLabel(trade),
        total: rows.length,
        bySplit: splitCounts,
        bySource: sourceCounts,
        syntheticShare: train.length === 0 ? 0 : simulatedTrain / train.length,
        reviewed: rows.filter((s) => s.status === "reviewed").length,
        abstained: rows.filter((s) => s.groundTruth.abstained).length,
        withRegions: rows.filter((s) => s.regions.length > 0).length,
        medianUncertaintyPct: median(
          rows.filter((s) => !s.groundTruth.abstained).map((s) => s.groundTruth.uncertaintyPct),
        ),
      };
    })
    .sort((a, b) => b.total - a.total);

  const conditionCoverage = CONDITION_TYPES.map((c) => ({
    id: c.id,
    label: c.label,
    count: live.filter((s) => s.conditions.some((tag) => tag.type === c.id)).length,
  }));

  const hardCaseCoverage = HARD_CASES.map((h) => ({
    id: h.id,
    label: h.label,
    count: live.filter((s) => s.hardCases.includes(h.id)).length,
  }));

  return {
    total: live.length,
    byTrade,
    conditionCoverage,
    hardCaseCoverage,
    bySplit,
    gaps: findGaps(live, byTrade, conditionCoverage, hardCaseCoverage),
  };
}

/**
 * Thresholds below.
 *
 * These are not statistical claims and are not pretending to be. They are the
 * point at which a number is too small to say anything, chosen so the page nags
 * early rather than congratulating you on a corpus that cannot support a figure.
 * The real values are only knowable after the §16 spike reports — the same caveat
 * the abstention threshold carries in `services/quantity-ml`.
 */
const MIN_HOLDOUT_PER_TRADE = 30;
const MIN_HARD_CASE_EXAMPLES = 10;
const MAX_COMFORTABLE_SYNTHETIC_SHARE = 0.5;

function findGaps(
  live: readonly TrainingSample[],
  byTrade: readonly TradeStats[],
  conditions: readonly { id: string; label: string; count: number }[],
  hardCases: readonly { id: string; label: string; count: number }[],
): Gap[] {
  const gaps: Gap[] = [];

  for (const t of byTrade) {
    if (t.total === 0) continue;

    if (t.bySplit.holdout < MIN_HOLDOUT_PER_TRADE) {
      gaps.push({
        severity: t.bySplit.holdout === 0 ? "critical" : "warning",
        headline: `${t.label}: held-out set is ${plural(t.bySplit.holdout, "sample")}`,
        detail:
          `The headline accuracy figure for this trade rests on this set (§5.5). Below ` +
          `${MIN_HOLDOUT_PER_TRADE} self-measured samples it cannot support a ±15% claim. ` +
          `Self-measured captures are the only source eligible.`,
      });
    }

    if (t.syntheticShare > MAX_COMFORTABLE_SYNTHETIC_SHARE) {
      gaps.push({
        severity: "warning",
        headline: `${t.label}: ${(t.syntheticShare * 100).toFixed(0)}% of training data is simulated`,
        detail:
          "§5.4d: a milestone must never be reachable by generating more data. This share " +
          "is stated on every accuracy report; if the number would move by swapping " +
          "synthetic for real, the claim is about the renderer, not the product.",
      });
    }

    if (t.bySource.anchor_as_built > t.bySource.self_measured && t.bySource.self_measured > 0) {
      gaps.push({
        severity: "warning",
        headline: `${t.label}: the anchor firm outweighs self-measurement`,
        detail:
          "§5.4b treats the anchor as a calibration check, never the training majority — " +
          "its as-builts encode one firm's install and reporting conventions.",
      });
    }

    if (t.total > 0 && t.reviewed / t.total < 0.5) {
      gaps.push({
        severity: "info",
        headline: `${t.label}: ${plural(t.total - t.reviewed, "sample")} awaiting review`,
        detail: "Only reviewed samples can enter a measuring split or an export.",
      });
    }
  }

  const thinHardCases = hardCases.filter((h) => h.count < MIN_HARD_CASE_EXAMPLES);
  if (live.length > 0 && thinHardCases.length > 0) {
    gaps.push({
      severity: "warning",
      headline: `${plural(thinHardCases.length, "hard case")} under ${MIN_HARD_CASE_EXAMPLES} examples`,
      detail:
        `Thin: ${thinHardCases.map((h) => h.label).join(", ")}. These are where abstention ` +
        "behaviour is decided (§5.4d) — a model evaluated only on clean photos has not " +
        "been evaluated. Simulated data is a legitimate way to fill these, for training.",
    });
  }

  const missingConditions = conditions.filter((c) => c.count === 0);
  if (live.length > 0 && missingConditions.length > 0) {
    gaps.push({
      severity: "info",
      headline: `${plural(missingConditions.length, "condition type")} with no examples`,
      detail:
        `Unseen: ${missingConditions.map((c) => c.label).join(", ")}. The condition head ` +
        "feeds the alerting engine's correlated-condition output — a type with no examples " +
        "will never be detected.",
    });
  }

  const noRegions = live.filter((s) => s.regions.length === 0).length;
  if (live.length > 0 && noRegions === live.length) {
    gaps.push({
      severity: "info",
      headline: "No region annotations anywhere in the corpus",
      detail:
        "Quantity can be learned from image-level counts alone, but region labels are what " +
        "make an estimate explainable to a foreman who disagrees with it.",
    });
  }

  return gaps;
}
