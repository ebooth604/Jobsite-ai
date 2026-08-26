/**
 * Synthetic demo data. Nothing here came from a jobsite.
 *
 * Every capture is `origin: "simulated"`, which is not cosmetic: it makes these
 * records fail `isMeasurableOrigin`, so they can never reach an accuracy figure
 * (§5.4d, §11). The demo therefore shows how a productivity factor is derived —
 * not how accurate the model is, because on invented data that number would be
 * meaningless and presenting it would be a lie told with a chart.
 *
 * The numbers are chosen to exercise the interesting paths: one scope item
 * tracking near bid, one drifting with a correlated access problem, one where the
 * model abstained, and one hours record with an unmapped cost code.
 */

import type {
  Capture,
  Condition,
  LabourHoursRecord,
  Project,
  QuantityEstimate,
  ScopeItem,
} from "./types.js";

export const DEMO_PROJECT: Project = {
  id: "proj-demo-1",
  name: "Riverbend Mixed-Use — Tower B",
  address: "1400 Riverbend Way, Burnaby",
  province: "BC",
  dataRegion: "ca-central-1",
};

export const SCOPE_ITEMS: ScopeItem[] = [
  {
    id: "scope-drywall-l4",
    projectId: DEMO_PROJECT.id,
    trade: "Drywall",
    description: "Level 4 board hang — north wing",
    unitOfMeasure: "sheets",
    bidQuantity: 2400,
    budgetedUnitsPerHour: 6.0,
  },
  {
    id: "scope-drywall-l5",
    projectId: DEMO_PROJECT.id,
    trade: "Drywall",
    description: "Level 5 board hang — north wing",
    unitOfMeasure: "sheets",
    bidQuantity: 2400,
    budgetedUnitsPerHour: 6.0,
  },
  {
    id: "scope-framing-l5",
    projectId: DEMO_PROJECT.id,
    trade: "Framing",
    description: "Level 5 metal stud partitions",
    unitOfMeasure: "lin ft",
    bidQuantity: 3100,
    budgetedUnitsPerHour: 18.0,
  },
];

const simulated = (
  id: string,
  area: string,
  capturedAt: string,
  capturedBy: string,
  projectId: string = DEMO_PROJECT.id,
): Capture => ({
  id,
  projectId,
  area,
  capturedAt,
  capturedBy,

  origin: "simulated",
});

export const CAPTURES: Capture[] = [
  simulated("cap-1", "L4 north corridor", "2026-08-17", "user-foreman-a"),
  simulated("cap-2", "L4 north corridor", "2026-08-18", "user-foreman-a"),
  simulated("cap-3", "L5 north corridor", "2026-08-18", "user-foreman-b"),
  simulated("cap-4", "L5 north corridor", "2026-08-19", "user-foreman-b"),
  simulated("cap-5", "L5 partitions", "2026-08-19", "user-foreman-b"),
  simulated("cap-6", "L5 partitions", "2026-08-20", "user-foreman-a"),
];

export const ESTIMATES: QuantityEstimate[] = [
  {
    id: "est-1",
    captureId: "cap-1",
    scopeItemId: "scope-drywall-l4",
    estimatedQuantity: 47,
    confidence: 0.91,
    abstained: false,
    modelVersion: "drywall-v0.3-demo",
  },
  {
    id: "est-2",
    captureId: "cap-2",
    scopeItemId: "scope-drywall-l4",
    estimatedQuantity: 45,
    confidence: 0.88,
    abstained: false,
    modelVersion: "drywall-v0.3-demo",
  },
  {
    id: "est-3",
    captureId: "cap-3",
    scopeItemId: "scope-drywall-l5",
    estimatedQuantity: 29,
    confidence: 0.84,
    abstained: false,
    modelVersion: "drywall-v0.3-demo",
  },
  {
    id: "est-4",
    captureId: "cap-4",
    scopeItemId: "scope-drywall-l5",
    estimatedQuantity: 26,
    confidence: 0.8,
    abstained: false,
    modelVersion: "drywall-v0.3-demo",
  },
  // Low light, partial occlusion — the model declines rather than guessing. This
  // is a feature worth showing: the quantity is absent, not silently zero.
  {
    id: "est-5",
    captureId: "cap-5",
    scopeItemId: "scope-framing-l5",
    estimatedQuantity: 0,
    confidence: 0.31,
    abstained: true,
    modelVersion: "framing-v0.2-demo",
  },
  {
    id: "est-6",
    captureId: "cap-6",
    scopeItemId: "scope-framing-l5",
    estimatedQuantity: 210,
    confidence: 0.86,
    abstained: false,
    modelVersion: "framing-v0.2-demo",
  },
];

export const HOURS: LabourHoursRecord[] = [
  {
    id: "hrs-1",
    projectId: DEMO_PROJECT.id,
    scopeItemId: "scope-drywall-l4",
    date: "2026-08-17",
    hours: 8,
    sourceSystem: "Procore",
    normalizationFlags: [],
  },
  {
    id: "hrs-2",
    projectId: DEMO_PROJECT.id,
    scopeItemId: "scope-drywall-l5",
    date: "2026-08-18",
    hours: 8,
    sourceSystem: "Procore",
    normalizationFlags: [],
  },
  {
    id: "hrs-3",
    projectId: DEMO_PROJECT.id,
    scopeItemId: "scope-framing-l5",
    date: "2026-08-20",
    hours: 12,
    sourceSystem: "Procore",
    normalizationFlags: [],
  },
  // Unmapped cost code: held back from the join and surfaced as a data-quality
  // item rather than being folded into a factor (§11).
  {
    id: "hrs-4",
    projectId: DEMO_PROJECT.id,
    scopeItemId: null,
    date: "2026-08-19",
    hours: 6,
    sourceSystem: "Procore",
    normalizationFlags: ["unmapped_cost_code:04-320"],
  },
];

export const CONDITIONS: Condition[] = [
  {
    id: "cond-1",
    captureId: "cap-3",
    conditionType: "blocked_access",
    description: "Material staging blocking corridor at L5 north",
    confidence: 0.79,
  },
  {
    id: "cond-2",
    captureId: "cap-4",
    conditionType: "stacked_trades",
    description: "Mechanical rough-in working same corridor",
    confidence: 0.74,
  },
];

/** capture id → scope item id, so conditions can be tied back to a scope item. */
export const CONDITION_CAPTURE_SCOPE = new Map<string, string>(
  ESTIMATES.map((e) => [e.captureId, e.scopeItemId]),
);

/**
 * Two further projects, so the customer landing page has a real portfolio to
 * select from rather than one card.
 *
 * Kilmer is mid-flight with a framing overrun. Fraser Exchange is deliberately
 * pre-capture — a project that exists in the bid but has no photos yet is the
 * ordinary state of a new deployment, and a landing page that cannot render that
 * honestly would be hiding the most common case.
 */

export const KILMER_PROJECT: Project = {
  id: "proj-demo-2",
  name: "Kilmer Ridge — Phase 2",
  address: "2200 Kilmer Road, Surrey",
  province: "BC",
  dataRegion: "ca-central-1",
};

export const FRASER_PROJECT: Project = {
  id: "proj-demo-3",
  name: "Fraser Exchange — Podium",
  address: "88 Exchange Street, New Westminster",
  province: "BC",
  dataRegion: "ca-central-1",
};

export const ALL_PROJECTS: Project[] = [DEMO_PROJECT, KILMER_PROJECT, FRASER_PROJECT];

export const KILMER_SCOPE_ITEMS: ScopeItem[] = [
  {
    id: "k-scope-framing-l2",
    projectId: KILMER_PROJECT.id,
    trade: "Framing",
    description: "Level 2 interior partitions",
    unitOfMeasure: "lin ft",
    bidQuantity: 4200,
    budgetedUnitsPerHour: 20.0,
  },
  {
    id: "k-scope-drywall-l2",
    projectId: KILMER_PROJECT.id,
    trade: "Drywall",
    description: "Level 2 board hang — east block",
    unitOfMeasure: "sheets",
    bidQuantity: 1900,
    budgetedUnitsPerHour: 5.5,
  },
];

export const KILMER_CAPTURES: Capture[] = [
  simulated("k-cap-1", "L2 east corridor", "2026-08-19", "user-foreman-c", KILMER_PROJECT.id),
  simulated("k-cap-2", "L2 east corridor", "2026-08-20", "user-foreman-c", KILMER_PROJECT.id),
];

export const KILMER_ESTIMATES: QuantityEstimate[] = [
  {
    id: "k-est-1",
    captureId: "k-cap-1",
    scopeItemId: "k-scope-framing-l2",
    estimatedQuantity: 132,
    confidence: 0.87,
    abstained: false,
    modelVersion: "framing-v0.2-demo",
  },
  {
    id: "k-est-2",
    captureId: "k-cap-2",
    scopeItemId: "k-scope-drywall-l2",
    estimatedQuantity: 41,
    confidence: 0.9,
    abstained: false,
    modelVersion: "drywall-v0.3-demo",
  },
];

export const KILMER_HOURS: LabourHoursRecord[] = [
  {
    id: "k-hrs-1",
    projectId: KILMER_PROJECT.id,
    scopeItemId: "k-scope-framing-l2",
    date: "2026-08-19",
    hours: 10,
    sourceSystem: "Rhumbix",
    normalizationFlags: [],
  },
  {
    id: "k-hrs-2",
    projectId: KILMER_PROJECT.id,
    scopeItemId: "k-scope-drywall-l2",
    date: "2026-08-20",
    hours: 8,
    sourceSystem: "Rhumbix",
    normalizationFlags: [],
  },
];

export const KILMER_CONDITIONS: Condition[] = [
  {
    id: "k-cond-1",
    captureId: "k-cap-1",
    conditionType: "out_of_sequence",
    description: "Overhead mechanical incomplete above partition line",
    confidence: 0.71,
  },
];
