/**
 * The reading surfaces: library, review queue, coverage, export and integrity.
 *
 * All of these are server-rendered from the store on every request and carry no
 * client JavaScript except where the work genuinely needs a canvas. Filters live
 * in the query string, which means a filtered view is a URL — you can send someone
 * "the electrical samples nobody has reviewed" rather than describing it.
 */

import type { ClassifyQueueResult } from "./api.js";
import {
  CONDITION_TYPES,
  type GroundTruthSource,
  SAMPLE_STATUSES,
  SOURCE_LABELS,
  SPLIT_LABELS,
  SPLITS,
  TRADES,
  type TrainingSample,
  tradeLabel,
} from "./dataset.js";
import type { ExportResult } from "./export.js";
import { blocks, findViolations, labelReadiness } from "./guards.js";
import { corpusStats } from "./stats.js";
import type { Orphans } from "./store.js";
import { escapeHtml, page, proportionBar, statTiles } from "./ui.js";

export interface LibraryFilters {
  trade: string;
  source: string;
  split: string;
  status: string;
  query: string;
}

export const EMPTY_FILTERS: LibraryFilters = {
  trade: "",
  source: "",
  split: "",
  status: "",
  query: "",
};

/**
 * Filtering is done here rather than in the store so that the store stays a dumb,
 * inspectable directory. At corpus scale the difference is unmeasurable, and the
 * property worth protecting is that nothing about how the data reads is encoded
 * in how it is stored.
 */
export function applyFilters(
  samples: readonly TrainingSample[],
  filters: LibraryFilters,
): TrainingSample[] {
  const needle = filters.query.trim().toLowerCase();
  return samples.filter((s) => {
    if (filters.trade && s.groundTruth.trade !== filters.trade) return false;
    if (filters.source && s.source !== filters.source) return false;
    if (filters.split && s.split !== filters.split) return false;
    if (filters.status && s.status !== filters.status) return false;
    if (!needle) return true;
    return [s.projectRef, s.area, s.groundTruth.scopeDescription, s.captureNotes, s.id]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

function option(value: string, label: string, current: string): string {
  return `<option value="${escapeHtml(value)}"${
    current === value ? " selected" : ""
  }>${escapeHtml(label)}</option>`;
}

function filterBar(filters: LibraryFilters): string {
  const trades = TRADES.map((t) => option(t.id, t.label, filters.trade)).join("");
  const sources = (Object.keys(SOURCE_LABELS) as GroundTruthSource[])
    .map((s) => option(s, SOURCE_LABELS[s], filters.source))
    .join("");
  const splits = SPLITS.map((s) => option(s, SPLIT_LABELS[s], filters.split)).join("");
  const statuses = SAMPLE_STATUSES.map((s) => option(s, s, filters.status)).join("");

  return `
<form method="get" action="/" class="panel" style="margin-bottom:16px">
  <div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
    <div class="field" style="margin:0">
      <label for="f-query">Search</label>
      <input id="f-query" name="q" type="search" value="${escapeHtml(filters.query)}"
        placeholder="project, area, scope">
    </div>
    <div class="field" style="margin:0">
      <label for="f-trade">Trade</label>
      <select id="f-trade" name="trade"><option value="">All</option>${trades}</select>
    </div>
    <div class="field" style="margin:0">
      <label for="f-source">Source</label>
      <select id="f-source" name="source"><option value="">All</option>${sources}</select>
    </div>
    <div class="field" style="margin:0">
      <label for="f-split">Split</label>
      <select id="f-split" name="split"><option value="">All</option>${splits}</select>
    </div>
    <div class="field" style="margin:0">
      <label for="f-status">Status</label>
      <select id="f-status" name="status"><option value="">All</option>${statuses}</select>
    </div>
    <div class="field" style="margin:0;align-self:end">
      <button type="submit" class="btn primary" style="width:100%">Filter</button>
    </div>
  </div>
</form>`;
}

function sampleCard(sample: TrainingSample): string {
  const gt = sample.groundTruth;
  const quantity = gt.abstained
    ? "unmeasurable"
    : gt.quantity === null
      ? "no quantity"
      : `${gt.quantity} ${gt.unitOfMeasure}`;
  const statusChip =
    sample.status === "reviewed"
      ? '<span class="chip good">reviewed</span>'
      : sample.status === "rejected"
        ? '<span class="chip critical">rejected</span>'
        : `<span class="chip">${escapeHtml(sample.status)}</span>`;
  const simChip = sample.source === "simulated" ? '<span class="chip sim">simulated</span>' : "";

  return `
<a class="card" href="/sample/${escapeHtml(sample.id)}">
  <img src="/images/${escapeHtml(sample.imageFile)}" alt="" loading="lazy">
  <div class="card-body">
    <strong>${escapeHtml(gt.scopeDescription || "Unlabelled")}</strong>
    <div class="muted">${escapeHtml(sample.projectRef || "—")} · ${escapeHtml(sample.area || "—")}</div>
    <div class="muted">${escapeHtml(tradeLabel(gt.trade))} · ${escapeHtml(quantity)}</div>
    <div style="margin-top:6px">
      ${statusChip}
      <span class="chip">${escapeHtml(SPLIT_LABELS[sample.split])}</span>
      ${simChip}
    </div>
  </div>
</a>`;
}

export function libraryView(
  all: readonly TrainingSample[],
  filters: LibraryFilters,
  storePath: string,
): string {
  const shown = applyFilters(all, filters);
  const stats = corpusStats(all);
  const drafts = all.filter((s) => s.status === "draft").length;
  const awaiting = all.filter((s) => s.status === "labelled").length;

  const tiles = statTiles([
    { label: "Samples", value: String(all.length), note: "rejected excluded from counts below" },
    {
      label: "Unlabelled",
      value: String(drafts),
      note: "photos in, labels not yet",
      ...(drafts > 0 ? { status: "warning" as const } : {}),
    },
    {
      label: "Awaiting review",
      value: String(awaiting),
      note: "needs a second pair of eyes",
      ...(awaiting > 0 ? { status: "warning" as const } : {}),
    },
    {
      label: "Held out",
      value: String(stats.bySplit.holdout),
      note: "the headline accuracy set",
      ...(stats.bySplit.holdout === 0 ? { status: "critical" as const } : {}),
    },
  ]);

  const body = `
${tiles}
${filterBar(filters)}
${
  shown.length === 0
    ? `<div class="empty">Nothing matches. <a href="/intake">Add photos</a> or widen the filter.</div>`
    : `<p class="muted" style="font-size:13px">${shown.length} of ${all.length} shown</p>
       <div class="grid">${shown.map(sampleCard).join("")}</div>`
}`;

  return page({
    title: "Library",
    path: "/",
    heading: "Library",
    lede: "Everything in the corpus. Click a photo to label or review it.",
    storePath,
    sampleCount: all.length,
    body,
  });
}

export function reviewView(
  all: readonly TrainingSample[],
  storePath: string,
  classifyResult: ClassifyQueueResult | null,
): string {
  // Oldest first: a labelling session that ends with twenty unreviewed samples
  // should be worked off in the order it was created, not newest-first, or the
  // tail never gets looked at.
  const queue = all
    .filter((s) => s.status === "draft" || s.status === "labelled")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const unclassified = queue.filter((s) => !s.groundTruth.trade.trim()).length;

  const classifyBanner = classifyResult
    ? `<div class="note" style="margin-bottom:14px">
  <strong>Classified ${classifyResult.classified}, skipped ${classifyResult.skipped}.</strong>
  ${
    classifyResult.remaining > 0
      ? `${classifyResult.remaining} still unclassified — click again to keep going.`
      : "Nothing left unclassified in this queue."
  }
  ${
    classifyResult.errors.length > 0
      ? `<ul style="margin:8px 0 0 18px">${classifyResult.errors
          .map((e) => `<li>${escapeHtml(e)}</li>`)
          .join("")}</ul>`
      : ""
  }
</div>`
    : "";

  const classifyForm =
    unclassified > 0
      ? `<form method="post" action="/review" class="panel" style="margin-bottom:14px">
  <button type="submit" class="btn">Suggest classification for this queue</button>
  <p class="field-hint" style="margin:6px 0 0">
    Drafts a trade, scope description, conditions and hard-case tags for up to 20 of the
    ${unclassified} photo(s) with no trade set yet, skipping anything already started.
    Status is unchanged — still needs a look before it's reviewed.
  </p>
</form>`
      : "";

  const rows = queue
    .map((s) => {
      const readiness = labelReadiness(s);
      const blocking = readiness.ready
        ? '<span class="chip good">ready to review</span>'
        : `<span class="chip warning">${readiness.missing.length} to fix</span>`;
      return `
<tr>
  <td style="width:96px">
    <a href="/sample/${escapeHtml(s.id)}">
      <img src="/images/${escapeHtml(s.imageFile)}" alt="" width="88"
        style="border-radius:4px;display:block">
    </a>
  </td>
  <td>
    <a href="/sample/${escapeHtml(s.id)}">${escapeHtml(
      s.groundTruth.scopeDescription || "Unlabelled sample",
    )}</a>
    <div class="muted">${escapeHtml(s.projectRef || "—")} · ${escapeHtml(s.area || "—")} ·
      ${escapeHtml(tradeLabel(s.groundTruth.trade))}</div>
    <div>${blocking} <span class="chip">${escapeHtml(s.status)}</span>
      <span class="chip">${escapeHtml(SOURCE_LABELS[s.source])}</span></div>
  </td>
  <td>${
    readiness.ready
      ? '<span class="muted">—</span>'
      : `<ul style="margin:0 0 0 16px;padding:0;font-size:13px" class="muted">${readiness.missing
          .map((m) => `<li>${escapeHtml(m)}</li>`)
          .join("")}</ul>`
  }</td>
</tr>`;
    })
    .join("");

  const body =
    queue.length === 0
      ? `<div class="empty">Nothing waiting. Every sample is reviewed or rejected.</div>`
      : `${classifyBanner}${classifyForm}<div class="note">
    <strong>Review means a second person checked the number.</strong> Nothing enters a
    measuring split — or an export — until it does. An unreviewed measurement in a
    held-out set is an accuracy claim resting on one person having a good day.
  </div>
  <table style="margin-top:14px">
    <thead><tr><th></th><th>Sample</th><th>Outstanding</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  return page({
    title: "Review queue",
    path: "/review",
    heading: "Review queue",
    lede: `${queue.length} sample(s) not yet reviewed, oldest first.`,
    storePath,
    sampleCount: all.length,
    body,
  });
}

export function coverageView(all: readonly TrainingSample[], storePath: string): string {
  const stats = corpusStats(all);

  const gapCards = stats.gaps
    .map(
      (gap) => `
<div class="note ${gap.severity === "critical" ? "stop" : gap.severity === "warning" ? "warn" : ""}"
  style="margin-bottom:10px">
  <strong>${escapeHtml(gap.headline)}</strong><br>${escapeHtml(gap.detail)}
</div>`,
    )
    .join("");

  const tradeRows = stats.byTrade
    .filter((t) => t.total > 0)
    .map(
      (t) => `
<tr>
  <td><strong>${escapeHtml(t.label)}</strong></td>
  <td class="num">${t.total}</td>
  <td class="num">${t.bySplit.train}</td>
  <td class="num">${t.bySplit.val}</td>
  <td class="num">${t.bySplit.holdout}</td>
  <td class="num">${t.bySplit.calibration}</td>
  <td>${proportionBar(
    Math.round(t.syntheticShare * t.bySplit.train),
    t.bySplit.train,
    t.syntheticShare > 0.5 ? "warning" : "good",
  )}</td>
  <td class="num">${
    t.medianUncertaintyPct === null ? "—" : `±${t.medianUncertaintyPct.toFixed(1)}%`
  }</td>
</tr>`,
    )
    .join("");

  const sourceRows = stats.byTrade
    .filter((t) => t.total > 0)
    .map(
      (t) => `
<tr>
  <td><strong>${escapeHtml(t.label)}</strong></td>
  <td class="num">${t.bySource.self_measured}</td>
  <td class="num">${t.bySource.anchor_as_built}</td>
  <td class="num">${t.bySource.production_correction}</td>
  <td class="num">${t.bySource.simulated}</td>
  <td class="num">${t.reviewed}</td>
  <td class="num">${t.abstained}</td>
  <td class="num">${t.withRegions}</td>
</tr>`,
    )
    .join("");

  const coverageList = (
    rows: readonly { id: string; label: string; count: number }[],
    threshold: number,
  ): string =>
    `<table><thead><tr><th>Type</th><th>Examples</th><th class="num">Count</th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr>
  <td>${escapeHtml(r.label)}</td>
  <td>${proportionBar(r.count, threshold, r.count === 0 ? "critical" : r.count < threshold ? "warning" : "good")}</td>
  <td class="num">${r.count}</td>
</tr>`,
      )
      .join("")}</tbody></table>`;

  const body = `
${statTiles([
  { label: "Samples", value: String(stats.total), note: "excluding rejected" },
  { label: "Train", value: String(stats.bySplit.train), note: "fits the model" },
  {
    label: "Held out",
    value: String(stats.bySplit.holdout),
    note: "self-measured only (§5.5)",
    ...(stats.bySplit.holdout === 0 ? { status: "critical" as const } : {}),
  },
  {
    label: "Calibration",
    value: String(stats.bySplit.calibration),
    note: "anchor firm, reported alongside",
  },
])}

<h2>What to shoot next</h2>
${gapCards || '<div class="note">No gaps flagged. That is unusual — check the corpus is not simply empty.</div>'}

<h2>Splits and synthetic share, per trade</h2>
<p class="muted" style="font-size:13px;margin-top:-4px">
  Per trade because §5.1 builds and evaluates each trade separately — a corpus total
  averages away exactly the weakness that separation exists to expose.
</p>
<table>
  <thead><tr>
    <th>Trade</th><th class="num">Total</th><th class="num">Train</th><th class="num">Val</th>
    <th class="num">Holdout</th><th class="num">Calib.</th><th>Synthetic share of train</th>
    <th class="num">Median ±</th>
  </tr></thead>
  <tbody>${tradeRows || '<tr><td colspan="8" class="muted">No samples yet.</td></tr>'}</tbody>
</table>

<h2>Ground-truth provenance</h2>
<table>
  <thead><tr>
    <th>Trade</th><th class="num">Self-measured</th><th class="num">Anchor</th>
    <th class="num">Corrections</th><th class="num">Simulated</th><th class="num">Reviewed</th>
    <th class="num">Unmeasurable</th><th class="num">With regions</th>
  </tr></thead>
  <tbody>${sourceRows || '<tr><td colspan="8" class="muted">No samples yet.</td></tr>'}</tbody>
</table>

<h2>Hard-case coverage</h2>
<p class="muted" style="font-size:13px;margin-top:-4px">
  Bars are against a working minimum of 10 examples — enough to notice a failure, not
  enough to claim anything. These are where abstention behaviour is decided.
</p>
${coverageList(stats.hardCaseCoverage, 10)}

<h2>Condition coverage</h2>
<p class="muted" style="font-size:13px;margin-top:-4px">
  The condition head feeds the alerting engine's correlated-condition output. A type
  with no examples will never be detected.
</p>
${coverageList(stats.conditionCoverage, 10)}
`;

  return page({
    title: "Coverage",
    path: "/coverage",
    heading: "Coverage",
    lede: "Where the corpus is thin, per trade, and what that stops you claiming.",
    storePath,
    sampleCount: all.length,
    body,
  });
}

export function exportView(
  all: readonly TrainingSample[],
  storePath: string,
  result: ExportResult | null,
): string {
  const violations = findViolations(all);
  const enforceHere = blocks();
  // Mirrors export.ts's selectSamples: blocking mode cuts reviewed samples only,
  // advisory mode cuts drafts too (everything but a labeller's own rejection).
  const exportable = all.filter((s) => (enforceHere ? s.status === "reviewed" : s.status !== "rejected"));

  const splitBoxes = SPLITS.filter((s) => s !== "unassigned")
    .map((split) => {
      const count = exportable.filter((s) => s.split === split).length;
      const checked = split === "train" || split === "val" ? " checked" : "";
      const countLabel = enforceHere ? "reviewed sample(s)" : "eligible sample(s)";
      return `<div class="check">
  <input type="checkbox" id="split-${split}" name="splits" value="${split}"${checked}>
  <label for="split-${split}">${escapeHtml(SPLIT_LABELS[split])}
    <span class="muted">— ${count} ${countLabel}</span></label>
</div>`;
    })
    .join("");

  const resultBlock = result
    ? result.ok
      ? `<div class="note" style="margin-bottom:16px">
  <strong>Cut ${result.sampleCount} sample(s).</strong>
  Written to <code>${escapeHtml(result.directory)}</code> —
  <code>manifest.jsonl</code>, <code>regions.coco.json</code>, <code>DATASET_CARD.md</code>
  and an <code>images/</code> copy.
  ${
    result.warnings.length
      ? `<ul style="margin:8px 0 0 18px">${result.warnings
          .map((w) => `<li>${escapeHtml(w)}</li>`)
          .join("")}</ul>`
      : ""
  }
</div>`
      : `<div class="note stop" style="margin-bottom:16px">
  <strong>Export refused.</strong>
  <ul style="margin:8px 0 0 18px">${result.violations
    .map(
      (v) =>
        `<li><code>${escapeHtml(v.rule)}</code> — ${escapeHtml(v.detail)}
         ${
           v.sampleId === "—"
             ? ""
             : `(<a href="/sample/${escapeHtml(v.sampleId)}">${escapeHtml(
                 v.sampleId.slice(0, 8),
               )}</a>)`
}</li>`,
    )
    .join("")}</ul>
</div>`
    : "";

  const body = `
${resultBlock}
${
  violations.length > 0
    ? enforceHere
      ? `<div class="note stop">
  <strong>${violations.length} outstanding violation(s).</strong> Export is blocked until the
  corpus is clean — see <a href="/integrity">Integrity</a>. This is the §11 rule: the leak
  check fails the operation rather than relying on someone remembering it.
</div>`
      : `<div class="note">
  <strong>${violations.length} outstanding violation(s).</strong> Advisory mode: the cut
  proceeds anyway and every violation is listed on the card and on
  <a href="/integrity">Integrity</a>. Set <code>SITEWIREAI_ENFORCEMENT=blocking</code> to
  refuse the export instead.
</div>`
    : `<div class="note">
  <strong>Corpus is clean.</strong> No simulated sample sits in a measuring split, every
  held-out sample is self-measured, and every photo carries a redaction decision.
</div>`
}

<form method="post" action="/export" class="panel" style="margin-top:16px">
  <h2 style="margin-top:0">Cut a training set</h2>
  <p class="field-hint" style="margin-top:-4px">
    ${
      enforceHere
        ? "Only reviewed samples are included, whichever splits you tick."
        : "Advisory mode: draft and reviewed samples are both included, tagged with " +
          "status on every manifest line, whichever splits you tick."
    }
  </p>
  ${splitBoxes}

  <div class="row">
    <div class="field">
      <label for="cut-by">Cut by</label>
      <input id="cut-by" name="cutBy" type="text" required placeholder="E. Booth">
    </div>
    <div class="field">
      <label for="cut-note">Note</label>
      <input id="cut-note" name="note" type="text"
        placeholder="First electrical rough-in cut">
    </div>
  </div>

  <button type="submit" class="btn primary"${enforceHere && violations.length > 0 ? " disabled" : ""}>
    Write the cut
  </button>
  <p class="field-hint">
    The dataset card states the synthetic share of the training mix per trade. §5.4d
    requires that figure on any accuracy report that leaves the building, and writing it
    at the moment the data is cut is the only way it reliably gets there.
  </p>
</form>`;

  return page({
    title: "Export",
    path: "/export",
    heading: "Export",
    lede: "Turn the corpus into a manifest, a COCO file and a dataset card that says what may be claimed from it.",
    storePath,
    sampleCount: all.length,
    body,
  });
}

export function integrityView(
  all: readonly TrainingSample[],
  orphans: Orphans,
  unreadable: readonly string[],
  storePath: string,
): string {
  const violations = findViolations(all);

  const violationRows = violations
    .map(
      (v) => `<tr>
  <td><code>${escapeHtml(v.rule)}</code></td>
  <td>${escapeHtml(v.detail)}</td>
  <td>${
    v.sampleId === "—"
      ? "—"
      : `<a href="/sample/${escapeHtml(v.sampleId)}">${escapeHtml(v.sampleId.slice(0, 8))}</a>`
  }</td>
</tr>`,
    )
    .join("");

  const list = (items: readonly string[]): string =>
    items.length === 0
      ? '<p class="muted">None.</p>'
      : `<ul>${items.map((i) => `<li><code>${escapeHtml(i)}</code></li>`).join("")}</ul>`;

  const conditionsInUse = new Set(all.flatMap((s) => s.conditions.map((c) => c.type)));
  const unknownConditions = [...conditionsInUse].filter(
    (type) => !CONDITION_TYPES.some((c) => c.id === type),
  );

  const body = `
${
  violations.length === 0
    ? '<div class="note"><strong>No violations.</strong> The corpus can be exported.</div>'
    : blocks()
      ? `<div class="note stop"><strong>${violations.length} violation(s).</strong>
       Export is blocked until these are resolved.</div>
  <table style="margin-top:14px">
    <thead><tr><th>Rule</th><th>Detail</th><th>Sample</th></tr></thead>
    <tbody>${violationRows}</tbody>
  </table>`
      : `<div class="note"><strong>${violations.length} violation(s).</strong>
       Advisory mode: these do not block the export, but every one lands on the dataset
       card and here. Set <code>SITEWIREAI_ENFORCEMENT=blocking</code> to refuse writes
       that violate them instead.</div>
  <table style="margin-top:14px">
    <thead><tr><th>Rule</th><th>Detail</th><th>Sample</th></tr></thead>
    <tbody>${violationRows}</tbody>
  </table>`
}

<h2>Files</h2>
<p class="muted" style="font-size:13px;margin-top:-4px">
  The store is a plain directory and hand-editing it is supported. These are the ways
  that goes wrong quietly.
</p>

<h3>Images with no sample</h3>
<p class="muted" style="font-size:13px">
  A photograph of somebody's workplace that nothing will ever show you again. Delete it
  or write it a sample file.
</p>
${list(orphans.imagesWithoutSample)}

<h3>Samples with no image</h3>
${list(orphans.samplesWithoutImage)}

<h3>Unreadable sample files</h3>
<p class="muted" style="font-size:13px">
  These are skipped by every other page rather than crashing it. They are still on disk.
</p>
${list(unreadable)}

<h3>Condition types not in the taxonomy</h3>
<p class="muted" style="font-size:13px">
  A condition head trained under one set of names and consumed under another is a bug
  that only surfaces in production.
</p>
${list(unknownConditions)}

<h2>Where everything lives</h2>
<p class="muted" style="font-size:13px">
  <code>${escapeHtml(storePath)}</code> — <code>samples/</code> one JSON file per sample,
  <code>images/</code> the redacted renders, <code>exports/</code> every cut you have made.
  Back this up like it is the company's most valuable asset, because until there is a
  model, it is.
</p>`;

  return page({
    title: "Integrity",
    path: "/integrity",
    heading: "Integrity",
    lede: "Every rule the corpus is supposed to obey, checked against what is actually on disk.",
    storePath,
    sampleCount: all.length,
    body,
  });
}

/** Neighbour ids for the editor's previous/next controls, in library order. */
export function neighboursOf(
  all: readonly TrainingSample[],
  id: string,
): { prev: string | null; next: string | null } {
  const index = all.findIndex((s) => s.id === id);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? (all[index - 1]?.id ?? null) : null,
    next: index < all.length - 1 ? (all[index + 1]?.id ?? null) : null,
  };
}
