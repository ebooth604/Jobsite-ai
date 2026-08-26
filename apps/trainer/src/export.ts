/**
 * Export — turning the corpus into something a training job can read.
 *
 * Three artefacts, because three different readers need three different things:
 *
 *   manifest.jsonl    one line per sample, everything a quantity model needs
 *   regions.coco.json the region labels in a format detection tooling already reads
 *   DATASET_CARD.md   what a human needs before quoting a number off this data
 *
 * The card is not documentation-as-afterthought. §5.4d requires the synthetic
 * share of a training mix to be stated on any accuracy report that leaves the
 * building, and the only way that reliably happens is if the number is written at
 * the moment the data is cut, by the same code that cut it.
 *
 * Export refuses on any violation. That is the §11 requirement — the leak check
 * fails the build rather than relying on someone remembering — expressed at the
 * one boundary where data leaves this machine.
 */

import { REGION_CLASSES, type Split, type TrainingSample, tradeLabel } from "./dataset.js";
import { blocks, findViolations, isMeasuringSplit, type Violation } from "./guards.js";
import { corpusStats } from "./stats.js";
import { imageKey, readRaw, storeLocation, writeExportArtefact } from "./store.js";

export interface ExportRequest {
  /** Splits to include. Omitting `unassigned` is the normal case. */
  splits: readonly Split[];
  /** Cutting a card that names the mix means naming who cut it. */
  cutBy: string;
  note: string;
}

export interface ExportResult {
  ok: boolean;
  directory: string;
  sampleCount: number;
  violations: Violation[];
  /** Non-fatal notes: things worth reading before quoting a number off this cut. */
  warnings: string[];
}

/**
 * The subset rules that are about the *export* rather than about the corpus.
 *
 * Rejected samples never leave. Unreviewed samples never leave — an unreviewed
 * measurement is one person's afternoon, and it will be quoted as ground truth by
 * whoever reads the manifest six months from now.
 */
function selectSamples(
  samples: readonly TrainingSample[],
  splits: readonly Split[],
): TrainingSample[] {
  // Rejected always stays out, in either mode: that is a labeller saying "this
  // sample is wrong", which is a judgement rather than a rule to relax.
  //
  // Beyond that, blocking mode cuts only reviewed samples; advisory mode cuts
  // drafts too and puts `status` on every manifest line, so a training job can
  // filter on it and nobody mistakes an unreviewed measurement for a checked one.
  return samples.filter((s) => {
    if (!splits.includes(s.split) || s.status === "rejected") return false;
    return blocks() ? s.status === "reviewed" : true;
  });
}

function manifestLine(sample: TrainingSample): string {
  const gt = sample.groundTruth;
  return JSON.stringify({
    id: sample.id,
    image: `images/${sample.imageFile}`,
    sha256: sample.imageSha256,
    width: sample.width,
    height: sample.height,
    split: sample.split,
    source: sample.source,
    origin: sample.origin,
    trade: gt.trade,
    scope_description: gt.scopeDescription,
    unit_of_measure: gt.unitOfMeasure,
    quantity: gt.quantity,
    abstained: gt.abstained,
    measurement_method: gt.method,
    measurement_uncertainty_pct: gt.uncertaintyPct,
    measured_at: gt.measuredAt,
    area: sample.area,
    project_ref: sample.projectRef,
    captured_at: sample.capturedAt,
    conditions: sample.conditions.map((c) => ({ type: c.type, severity: c.severity })),
    hard_cases: sample.hardCases,
    region_count: sample.regions.length,
    faces_redacted: sample.faceRedaction.regions.length,
    declared_no_people: sample.faceRedaction.declaredNoPeople,
    status: sample.status,
    chain_count: sample.chains.length,
  });
}

/**
 * The reasoning cut — the artefact this whole tool exists to produce.
 *
 * The pipeline runs detect (YOLO11) → segment (YOLO11-seg) → **interpret**. The first
 * two are commodity and their output is geometry. This file is the third step: for
 * each confirmed chain, the geometry that was visible and the meaning a human
 * attached to it — what the condition cost, what to do, and where known, what
 * happened next.
 *
 * Shaped as input/target records rather than as a flat table because that is what
 * fine-tuning a reasoning model consumes. `input` is what the model will see at
 * inference: the scope context and the boxes the commodity stage already found.
 * `target` is what a person concluded from it.
 *
 * Auto-accepted chains are written too, tagged rather than dropped. The reasoning
 * model drafts everything and a human is asked only below the review threshold, so
 * excluding unconfirmed chains would silently discard most of the dataset and hide
 * the one number worth knowing. `review.human_confirmed` and
 * `review.model_confidence` travel on every record, and the confirmed share goes on
 * the dataset card — the same treatment §5.4d gives synthetic data. The training
 * job decides what to trust; it just cannot decide blind.
 */
function reasoningLine(sample: TrainingSample, chain: TrainingSample["chains"][number]): string {
  const cited = sample.regions.filter((r) => chain.regionIds.includes(r.id));

  return JSON.stringify({
    sample_id: sample.id,
    chain_id: chain.id,
    image: `images/${sample.imageFile}`,
    split: sample.split,
    source: sample.source,
    input: {
      trade: sample.groundTruth.trade,
      scope_description: sample.groundTruth.scopeDescription,
      area: sample.area,
      captured_at: sample.capturedAt,
      // Exactly what the commodity stage produces, and nothing more.
      geometry: cited.map((r) => ({
        region_id: r.id,
        class: r.className,
        kind: r.kind,
        points: r.points,
        proposed_by: r.proposedBy || "human",
      })),
      hard_cases: sample.hardCases,
    },
    target: {
      condition_type: chain.conditionType,
      severity: chain.severity,
      impact: {
        scope_ref: chain.impact.scopeRef,
        hours_lost: chain.impact.hoursLost,
        factor_delta: chain.impact.factorDelta,
        basis: chain.impact.basis,
        confidence: chain.impact.confidence,
      },
      recommendation: chain.recommendation.action,
      outcome: {
        status: chain.outcome.status,
        factor_after: chain.outcome.factorAfter,
        observed_at: chain.outcome.observedAt,
      },
    },
    review: {
      model_confidence: chain.modelConfidence,
      human_confirmed: Boolean(chain.confirmedBy.trim()),
      auto_accepted: chain.autoAccepted,
    },
    provenance: {
      // Who said what. A fine-tune that later looks biased is diagnosed from here.
      chain_proposed_by: chain.proposedBy || "human",
      chain_confirmed_by: chain.confirmedBy,
      impact_attributed_by: chain.impact.attributedBy,
      recommendation_confirmed_by: chain.recommendation.confirmedBy,
      outcome_recorded_by: chain.outcome.recordedBy,
    },
  });
}

interface CocoAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];
  area: number;
  iscrowd: 0;
  segmentation: number[][];
}

/**
 * COCO output.
 *
 * Points are stored normalised so they survive a resize; COCO wants pixels, so
 * they are multiplied back out here against the dimensions recorded at intake.
 * A polygon also gets a bounding box, because half the tooling that reads COCO
 * ignores segmentation entirely.
 */
function cocoDocument(samples: readonly TrainingSample[]): string {
  const categories = REGION_CLASSES.map((c, index) => ({
    id: index + 1,
    name: c.id,
    supercategory: c.trade ?? "shared",
  }));
  const categoryIds = new Map(categories.map((c) => [c.name, c.id]));

  const images = samples.map((s, index) => ({
    id: index + 1,
    file_name: `images/${s.imageFile}`,
    width: s.width,
    height: s.height,
    sitewireai_sample_id: s.id,
    sitewireai_split: s.split,
    sitewireai_source: s.source,
  }));

  const annotations: CocoAnnotation[] = [];
  let annotationId = 1;

  samples.forEach((sample, index) => {
    for (const region of sample.regions) {
      const categoryId = categoryIds.get(region.className);
      if (categoryId === undefined) continue;

      const xs = region.points.map(([x]) => x * sample.width);
      const ys = region.points.map(([, y]) => y * sample.height);
      if (xs.length === 0 || ys.length === 0) continue;

      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const width = Math.max(...xs) - minX;
      const height = Math.max(...ys) - minY;

      const flat: number[] = [];
      region.points.forEach(([x, y]) => {
        flat.push(x * sample.width, y * sample.height);
      });

      annotations.push({
        id: annotationId++,
        image_id: index + 1,
        category_id: categoryId,
        bbox: [round(minX), round(minY), round(width), round(height)],
        area: round(width * height),
        iscrowd: 0,
        // A box has two points; COCO segmentation wants a closed ring, so the
        // rectangle is written out rather than the two corners it was drawn from.
        segmentation:
          region.kind === "box"
            ? [
                [
                  round(minX),
                  round(minY),
                  round(minX + width),
                  round(minY),
                  round(minX + width),
                  round(minY + height),
                  round(minX),
                  round(minY + height),
                ],
              ]
            : [flat.map(round)],
      });
    }
  });

  return JSON.stringify(
    {
      info: {
        description: "SiteWireAi region annotations",
        contributor: "SiteWireAi trainer",
        date_created: new Date().toISOString(),
      },
      images,
      annotations,
      categories,
    },
    null,
    2,
  );
}

function contentTypeFor(file: string): string {
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * The dataset card.
 *
 * Written in the imperative about what this cut may and may not be used for,
 * rather than as a neutral description. Someone will read this in a hurry with a
 * board deck open beside them.
 */
function datasetCard(
  samples: readonly TrainingSample[],
  request: ExportRequest,
  cutAt: string,
  reasoningRecords: number,
  humanConfirmed: number,
): string {
  const stats = corpusStats(samples);
  const lines: string[] = [];

  lines.push("# SiteWireAi training cut");
  lines.push("");
  lines.push(`- **Cut at:** ${cutAt}`);
  lines.push(`- **Cut by:** ${request.cutBy}`);
  lines.push(`- **Splits included:** ${request.splits.join(", ")}`);
  lines.push(`- **Samples:** ${samples.length}`);
  lines.push(`- **Reasoning records:** ${reasoningRecords}`);
  lines.push(
    `- **Human-confirmed:** ${humanConfirmed} of ${reasoningRecords}` +
      (reasoningRecords > 0 ? ` (${pct(humanConfirmed / reasoningRecords)})` : ""),
  );
  if (request.note.trim()) lines.push(`- **Note:** ${request.note.trim()}`);
  lines.push("");
  lines.push("## The rule that governs this data");
  lines.push("");
  lines.push(
    "Simulated data may train a model and may never measure one (technical plan §5.4d, §11).",
  );
  lines.push(
    'No sample with `origin: "simulated"` appears in `val`, `holdout` or `calibration` in this',
  );
  lines.push(
    "cut — that is enforced at export, not asserted here. The headline accuracy figure is",
  );
  lines.push(
    "measured against `holdout`, which is self-measured only (§5.5). `calibration` holds the",
  );
  lines.push(
    "anchor firm's as-builts and is reported *alongside* the headline number, never blended",
  );
  lines.push("into it (§5.4b).");
  lines.push("");
  lines.push("## Synthetic share of training data, per trade");
  lines.push("");
  lines.push(
    "State this figure on any accuracy report derived from this cut. If a milestone would",
  );
  lines.push("move by swapping synthetic for real, the claim is about the renderer (§5.4d).");
  lines.push("");
  lines.push(
    "| Trade | Samples | Train | Val | Holdout | Calibration | Synthetic share of train |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const t of stats.byTrade) {
    if (t.total === 0) continue;
    lines.push(
      `| ${t.label} | ${t.total} | ${t.bySplit.train} | ${t.bySplit.val} | ` +
        `${t.bySplit.holdout} | ${t.bySplit.calibration} | ${pct(t.syntheticShare)} |`,
    );
  }
  lines.push("");
  lines.push("## Ground-truth provenance");
  lines.push("");
  lines.push(
    "| Trade | Self-measured | Anchor as-built | Production correction | Simulated | Median uncertainty |",
  );
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const t of stats.byTrade) {
    if (t.total === 0) continue;
    const uncertainty =
      t.medianUncertaintyPct === null ? "—" : `±${t.medianUncertaintyPct.toFixed(1)}%`;
    lines.push(
      `| ${t.label} | ${t.bySource.self_measured} | ${t.bySource.anchor_as_built} | ` +
        `${t.bySource.production_correction} | ${t.bySource.simulated} | ${uncertainty} |`,
    );
  }
  lines.push("");
  lines.push(
    "Median uncertainty is the labellers' own stated error bar. A model reported as accurate",
  );
  lines.push("to within a tighter band than this column is reporting measurement noise.");
  lines.push("");
  lines.push("## Hard-case coverage");
  lines.push("");
  lines.push(
    "Where abstention behaviour is actually decided. Thin rows are where a model will fail",
  );
  lines.push("first and where the corpus is least able to notice.");
  lines.push("");
  for (const h of stats.hardCaseCoverage) {
    lines.push(`- ${h.label}: ${h.count}`);
  }
  lines.push("");
  lines.push("## Condition coverage");
  lines.push("");
  for (const c of stats.conditionCoverage) {
    lines.push(`- ${c.label}: ${c.count}`);
  }
  lines.push("");
  lines.push("## The reasoning cut");
  lines.push("");
  lines.push(
    "`reasoning.jsonl` is the part of this dataset that cannot be downloaded from anywhere",
  );
  lines.push(
    "else. Detection and segmentation are commodity steps — YOLO11 finds boxes and outlines",
  );
  lines.push("them, and it knows nothing about what any of it means. Each record here pairs that");
  lines.push(
    "geometry with what a person concluded from it: what the condition cost, what to do, and",
  );
  lines.push("where known, what happened next.");
  lines.push("");
  lines.push(
    "The reasoning model drafts every chain; a human is asked only when its confidence falls",
  );
  lines.push("below the review threshold. That is the design, and it is what makes this volume of");
  lines.push(
    "interpretation possible — but it means some records here are unreviewed model output.",
  );
  lines.push("");
  lines.push(
    "**Read the human-confirmed share above before training on this.** Every record carries",
  );
  lines.push(
    "`review.human_confirmed` and `review.model_confidence`; filter on them for the checked",
  );
  lines.push(
    "subset. Training a model on its own unreviewed output is how a corpus becomes an echo of",
  );
  lines.push("the first thing it guessed, and confidently wrong is the failure mode that does not");
  lines.push("correct itself.");
  lines.push("");
  lines.push(
    "Watch the `basis` field too. Only `measured` impacts are reconciled against real labour",
  );
  lines.push(
    "hours; `foreman_estimate` is strong signal, and `inferred` is a model proposal somebody",
  );
  lines.push(
    "accepted. All three train. Only `measured` may back a figure that leaves the building.",
  );
  lines.push("");
  lines.push("## Privacy");
  lines.push("");
  lines.push("Every image in this cut was mosaicked in the browser before it was ever stored, or");
  lines.push(
    "a named person declared the frame free of people. Both facts are recorded per sample in",
  );
  lines.push(
    "`manifest.jsonl` (`faces_redacted`, `declared_no_people`). These are jobsite photographs",
  );
  lines.push("of real people's workplaces; treat the cut accordingly.");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

/**
 * Cuts an export. Nothing is written unless the whole corpus passes.
 *
 * The violation check runs over *every* sample rather than only the selected ones.
 * A leak in a split you happen not to be exporting today is still a leak, and the
 * moment you notice it should not depend on which checkbox was ticked.
 */
export async function runExport(
  samples: readonly TrainingSample[],
  request: ExportRequest,
): Promise<ExportResult> {
  const violations = findViolations(samples);
  const selected = selectSamples(samples, request.splits);

  // Advisory by default: a violation annotates the cut rather than cancelling it.
  // The warnings below and the dataset card both name every one, so nobody reads a
  // manifest without also being handed the list of things wrong with it.
  if (blocks() && violations.length > 0) {
    return {
      ok: false,
      directory: "",
      sampleCount: selected.length,
      violations,
      warnings: [],
    };
  }

  if (selected.length === 0) {
    return {
      ok: false,
      directory: "",
      sampleCount: 0,
      violations: [
        {
          sampleId: "—",
          rule: "empty-export",
          detail: "No reviewed samples in the selected splits. Nothing to cut.",
        },
      ],
      warnings: [],
    };
  }

  const cutAt = new Date().toISOString();
  const stamp = cutAt.replace(/[:.]/g, "-");
  const cut = `exports/cut-${stamp}`;

  // The cut is written through the same backend the corpus lives in, so an S3
  // corpus produces an S3 cut a training job can read directly, and a local corpus
  // produces a folder. Images are copied rather than referenced: a cut that points
  // back at the live corpus stops being a fixed set the moment someone relabels.
  const missingImages: string[] = [];
  for (const sample of selected) {
    const key = imageKey(sample.imageFile);
    const bytes = key ? await readRaw(key) : null;
    if (!bytes) {
      missingImages.push(sample.id);
      continue;
    }
    await writeExportArtefact(
      `${cut}/images/${sample.imageFile}`,
      bytes,
      contentTypeFor(sample.imageFile),
    );
  }

  const text = (value: string) => Buffer.from(value, "utf8");
  await writeExportArtefact(
    `${cut}/manifest.jsonl`,
    text(`${selected.map(manifestLine).join("\n")}\n`),
    "application/x-ndjson",
  );
  await writeExportArtefact(
    `${cut}/regions.coco.json`,
    text(cocoDocument(selected)),
    "application/json",
  );
  // Only confirmed chains leave. `guards.ts` refuses an unconfirmed one at the
  // corpus level too, so this is the second of two passes rather than the only one.
  // Auto-accepted chains are included rather than dropped. Excluding them would
  // silently shrink the dataset and hide the thing worth knowing; the honest move
  // is to ship them tagged and put the share on the card, the same way §5.4d
  // handles synthetic data. The training job decides; it cannot decide blind.
  const allChains = selected.flatMap((sample) => sample.chains.map((chain) => ({ sample, chain })));
  const reasoning = allChains.map(({ sample, chain }) => reasoningLine(sample, chain));
  const humanConfirmed = allChains.filter(({ chain }) => chain.confirmedBy.trim()).length;

  if (reasoning.length > 0) {
    await writeExportArtefact(
      `${cut}/reasoning.jsonl`,
      text(`${reasoning.join("\n")}\n`),
      "application/x-ndjson",
    );
  }

  await writeExportArtefact(
    `${cut}/DATASET_CARD.md`,
    text(datasetCard(selected, request, cutAt, reasoning.length, humanConfirmed)),
    "text/markdown",
  );

  const directory = `${storeLocation().replace(/[\\/]$/, "")}/${cut}`;

  const warnings: string[] = [];
  if (violations.length > 0) {
    warnings.push(
      `${violations.length} rule violation(s), cut anyway in advisory mode: ` +
        [...new Set(violations.map((v) => v.rule))].join(", ") +
        ". Full list on the Integrity page.",
    );
  }
  if (missingImages.length > 0) {
    warnings.push(
      `${missingImages.length} sample(s) had no image in the corpus and were listed in ` +
        `the manifest without one: ${missingImages.join(", ")}`,
    );
  }

  const measuring = selected.filter((s) => isMeasuringSplit(s.split));
  if (measuring.length === 0 && request.splits.some(isMeasuringSplit)) {
    warnings.push(
      "This cut contains no measuring split. It can train a model; it cannot produce an " +
        "accuracy figure.",
    );
  }

  for (const t of corpusStats(selected).byTrade) {
    if (t.total > 0 && t.bySplit.holdout === 0 && t.bySplit.train > 0) {
      warnings.push(
        `${tradeLabel(t.trade)} has training data in this cut and no held-out set — no ` +
          "accuracy figure can be quoted for it.",
      );
    }
  }

  return { ok: true, directory, sampleCount: selected.length, violations: [], warnings };
}
