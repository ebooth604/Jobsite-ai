/**
 * Two synthetic client organisations.
 *
 * Org A ports the fixtures the dashboard has always rendered — Riverbend,
 * Kilmer and the deliberately-empty Fraser Exchange. Org B is new and
 * **deliberately unlike it**: different province, different trades, different
 * units, different factor shapes, different source system.
 *
 * That difference is the point. If tenant scoping breaks, two orgs full of
 * similar drywall work in BC would leak into each other and still look
 * plausible on screen. An Ontario electrical contractor's conduit runs
 * appearing under a Burnaby drywall portfolio is unmistakable, so the seed is
 * shaped to make a scoping bug loud rather than subtle.
 *
 * Every capture is `origin: "simulated"` — invented, not recorded on a jobsite.
 * The rule that governs this data is unchanged: simulated captures may train a
 * model and may never measure one.
 */

export interface SeedOrg {
  id: string;
  name: string;
  slug: string;
  projects: {
    id: string;
    name: string;
    address: string;
    province: string;
  }[];
  scopeItems: {
    id: string;
    projectId: string;
    trade: string;
    description: string;
    unitOfMeasure: string;
    bidQuantity: number;
    budgetedUnitsPerHour: number;
  }[];
  captures: {
    id: string;
    projectId: string;
    area: string;
    capturedAt: string;
    capturedBy: string;
  }[];
  estimates: {
    id: string;
    captureId: string;
    scopeItemId: string;
    estimatedQuantity: number | null;
    confidence: number;
    abstained: boolean;
    modelVersion: string;
  }[];
  hours: {
    id: string;
    projectId: string;
    scopeItemId: string | null;
    date: string;
    hours: number;
    sourceSystem: string;
    normalizationFlags: string[];
  }[];
  conditions: {
    id: string;
    captureId: string;
    conditionType: string;
    description: string;
    confidence: number;
  }[];
}

/**
 * Org A — Northpoint Construction. BC, drywall and framing.
 *
 * Carries the two cases the demo was built to show honestly: an abstention
 * (a photo nobody could measure) and an unmapped cost code (hours held back
 * from the join rather than guessed into a factor).
 */
export const ORG_A: SeedOrg = {
  id: "org-northpoint",
  name: "Northpoint Construction",
  slug: "northpoint",

  projects: [
    {
      id: "proj-demo-1",
      name: "Riverbend Mixed-Use — Tower B",
      address: "1400 Riverbend Way, Burnaby",
      province: "BC",
    },
    {
      id: "proj-demo-2",
      name: "Kilmer Ridge — Phase 2",
      address: "2200 Kilmer Road, Surrey",
      province: "BC",
    },
    // Pre-capture on purpose: a project that exists in the bid but has no
    // photos yet is the ordinary state of a new deployment, and a portfolio
    // that cannot render that honestly hides the most common case.
    {
      id: "proj-demo-3",
      name: "Fraser Exchange — Podium",
      address: "88 Exchange Street, New Westminster",
      province: "BC",
    },
  ],

  scopeItems: [
    {
      id: "scope-drywall-l4",
      projectId: "proj-demo-1",
      trade: "Drywall",
      description: "Level 4 board hang — north wing",
      unitOfMeasure: "sheets",
      bidQuantity: 2400,
      budgetedUnitsPerHour: 6.0,
    },
    {
      id: "scope-drywall-l5",
      projectId: "proj-demo-1",
      trade: "Drywall",
      description: "Level 5 board hang — north wing",
      unitOfMeasure: "sheets",
      bidQuantity: 2400,
      budgetedUnitsPerHour: 6.0,
    },
    {
      id: "scope-framing-l5",
      projectId: "proj-demo-1",
      trade: "Framing",
      description: "Level 5 metal stud partitions",
      unitOfMeasure: "lin ft",
      bidQuantity: 3100,
      budgetedUnitsPerHour: 18.0,
    },
    {
      id: "k-scope-framing-l2",
      projectId: "proj-demo-2",
      trade: "Framing",
      description: "Level 2 metal stud partitions",
      unitOfMeasure: "lin ft",
      bidQuantity: 2800,
      budgetedUnitsPerHour: 18.0,
    },
    {
      id: "k-scope-drywall-l2",
      projectId: "proj-demo-2",
      trade: "Drywall",
      description: "Level 2 board hang",
      unitOfMeasure: "sheets",
      bidQuantity: 1900,
      budgetedUnitsPerHour: 6.0,
    },
  ],

  captures: [
    { id: "cap-1", projectId: "proj-demo-1", area: "L4 north corridor", capturedAt: "2026-08-17", capturedBy: "user-foreman-a" },
    { id: "cap-2", projectId: "proj-demo-1", area: "L4 north corridor", capturedAt: "2026-08-18", capturedBy: "user-foreman-a" },
    { id: "cap-3", projectId: "proj-demo-1", area: "L5 north corridor", capturedAt: "2026-08-18", capturedBy: "user-foreman-b" },
    { id: "cap-4", projectId: "proj-demo-1", area: "L5 north corridor", capturedAt: "2026-08-19", capturedBy: "user-foreman-b" },
    { id: "cap-5", projectId: "proj-demo-1", area: "L5 partitions", capturedAt: "2026-08-19", capturedBy: "user-foreman-b" },
    { id: "cap-6", projectId: "proj-demo-1", area: "L5 partitions", capturedAt: "2026-08-20", capturedBy: "user-foreman-a" },
    { id: "k-cap-1", projectId: "proj-demo-2", area: "L2 east partitions", capturedAt: "2026-08-18", capturedBy: "user-foreman-c" },
    { id: "k-cap-2", projectId: "proj-demo-2", area: "L2 east partitions", capturedAt: "2026-08-20", capturedBy: "user-foreman-c" },
  ],

  estimates: [
    { id: "est-1", captureId: "cap-1", scopeItemId: "scope-drywall-l4", estimatedQuantity: 47, confidence: 0.91, abstained: false, modelVersion: "drywall-v0.3-demo" },
    { id: "est-2", captureId: "cap-2", scopeItemId: "scope-drywall-l4", estimatedQuantity: 51, confidence: 0.88, abstained: false, modelVersion: "drywall-v0.3-demo" },
    { id: "est-3", captureId: "cap-3", scopeItemId: "scope-drywall-l5", estimatedQuantity: 42, confidence: 0.84, abstained: false, modelVersion: "drywall-v0.3-demo" },
    // The abstention. A photo nobody could measure is signal about when the
    // model should decline, not a gap to be filled with a guess.
    { id: "est-4", captureId: "cap-4", scopeItemId: "scope-drywall-l5", estimatedQuantity: null, confidence: 0.31, abstained: true, modelVersion: "drywall-v0.3-demo" },
    { id: "est-5", captureId: "cap-5", scopeItemId: "scope-framing-l5", estimatedQuantity: 210, confidence: 0.89, abstained: false, modelVersion: "framing-v0.2-demo" },
    { id: "est-6", captureId: "cap-6", scopeItemId: "scope-framing-l5", estimatedQuantity: 198, confidence: 0.86, abstained: false, modelVersion: "framing-v0.2-demo" },
    { id: "k-est-1", captureId: "k-cap-1", scopeItemId: "k-scope-framing-l2", estimatedQuantity: 168, confidence: 0.87, abstained: false, modelVersion: "framing-v0.2-demo" },
    { id: "k-est-2", captureId: "k-cap-2", scopeItemId: "k-scope-framing-l2", estimatedQuantity: 152, confidence: 0.83, abstained: false, modelVersion: "framing-v0.2-demo" },
  ],

  hours: [
    { id: "hrs-1", projectId: "proj-demo-1", scopeItemId: "scope-drywall-l4", date: "2026-08-17", hours: 8, sourceSystem: "Procore", normalizationFlags: [] },
    { id: "hrs-2", projectId: "proj-demo-1", scopeItemId: "scope-drywall-l5", date: "2026-08-18", hours: 8, sourceSystem: "Procore", normalizationFlags: [] },
    { id: "hrs-3", projectId: "proj-demo-1", scopeItemId: "scope-framing-l5", date: "2026-08-20", hours: 12, sourceSystem: "Procore", normalizationFlags: [] },
    // Unmapped cost code: held back from the join and surfaced on the
    // data-quality page rather than folded into a factor.
    { id: "hrs-4", projectId: "proj-demo-1", scopeItemId: null, date: "2026-08-19", hours: 6, sourceSystem: "Procore", normalizationFlags: ["unmapped_cost_code:04-320"] },
    { id: "k-hrs-1", projectId: "proj-demo-2", scopeItemId: "k-scope-framing-l2", date: "2026-08-18", hours: 14, sourceSystem: "Procore", normalizationFlags: [] },
    { id: "k-hrs-2", projectId: "proj-demo-2", scopeItemId: "k-scope-framing-l2", date: "2026-08-20", hours: 16, sourceSystem: "Procore", normalizationFlags: [] },
  ],

  conditions: [
    { id: "cond-1", captureId: "cap-3", conditionType: "blocked_access", description: "Material staging blocking corridor at L5 north", confidence: 0.79 },
    { id: "cond-2", captureId: "cap-4", conditionType: "stacked_trades", description: "Mechanical rough-in working same corridor", confidence: 0.74 },
    { id: "k-cond-1", captureId: "k-cap-2", conditionType: "material_shortage", description: "Track stock short at L2 east — crew idle 40 min", confidence: 0.81 },
  ],
};

/**
 * Org B — Meridian Builders. Ontario, electrical rough-in and concrete forming.
 *
 * Chosen to share nothing with org A: different province, different trades,
 * different units (device boxes and sq ft formed, not sheets and lin ft),
 * different timekeeping system, different ids. Any leak between the two is
 * visible at a glance.
 */
export const ORG_B: SeedOrg = {
  id: "org-meridian",
  name: "Meridian Builders",
  slug: "meridian",

  projects: [
    {
      id: "mer-proj-1",
      name: "Dundas Civic Centre — Block A",
      address: "410 Dundas Street West, Toronto",
      province: "ON",
    },
    {
      id: "mer-proj-2",
      name: "Lakeshore Logistics Hub",
      address: "1750 Lakeshore Boulevard, Etobicoke",
      province: "ON",
    },
  ],

  scopeItems: [
    {
      id: "mer-scope-elec-l1",
      projectId: "mer-proj-1",
      trade: "Electrical rough-in",
      description: "Level 1 device box rough-in — east wing",
      unitOfMeasure: "device boxes",
      bidQuantity: 1450,
      budgetedUnitsPerHour: 4.5,
    },
    {
      id: "mer-scope-elec-l2",
      projectId: "mer-proj-1",
      trade: "Electrical rough-in",
      description: "Level 2 conduit runs — east wing",
      unitOfMeasure: "lin ft conduit",
      bidQuantity: 5200,
      budgetedUnitsPerHour: 22.0,
    },
    {
      id: "mer-scope-forming-p1",
      projectId: "mer-proj-2",
      trade: "Concrete forming",
      description: "Podium deck forming — pour 1",
      unitOfMeasure: "sq ft formed",
      bidQuantity: 18400,
      budgetedUnitsPerHour: 95.0,
    },
  ],

  captures: [
    { id: "mer-cap-1", projectId: "mer-proj-1", area: "L1 east — grid C4-C7", capturedAt: "2026-08-16", capturedBy: "user-foreman-m1" },
    { id: "mer-cap-2", projectId: "mer-proj-1", area: "L1 east — grid C4-C7", capturedAt: "2026-08-18", capturedBy: "user-foreman-m1" },
    { id: "mer-cap-3", projectId: "mer-proj-1", area: "L2 east riser", capturedAt: "2026-08-19", capturedBy: "user-foreman-m2" },
    { id: "mer-cap-4", projectId: "mer-proj-2", area: "Podium deck — bay 3", capturedAt: "2026-08-17", capturedBy: "user-foreman-m3" },
    { id: "mer-cap-5", projectId: "mer-proj-2", area: "Podium deck — bay 4", capturedAt: "2026-08-20", capturedBy: "user-foreman-m3" },
  ],

  estimates: [
    { id: "mer-est-1", captureId: "mer-cap-1", scopeItemId: "mer-scope-elec-l1", estimatedQuantity: 38, confidence: 0.9, abstained: false, modelVersion: "electrical-v0.1-demo" },
    { id: "mer-est-2", captureId: "mer-cap-2", scopeItemId: "mer-scope-elec-l1", estimatedQuantity: 41, confidence: 0.87, abstained: false, modelVersion: "electrical-v0.1-demo" },
    { id: "mer-est-3", captureId: "mer-cap-3", scopeItemId: "mer-scope-elec-l2", estimatedQuantity: 186, confidence: 0.82, abstained: false, modelVersion: "electrical-v0.1-demo" },
    { id: "mer-est-4", captureId: "mer-cap-4", scopeItemId: "mer-scope-forming-p1", estimatedQuantity: 780, confidence: 0.85, abstained: false, modelVersion: "forming-v0.1-demo" },
    // A second abstention, in a different trade, so the data-quality page has
    // something to show for this tenant too.
    { id: "mer-est-5", captureId: "mer-cap-5", scopeItemId: "mer-scope-forming-p1", estimatedQuantity: null, confidence: 0.28, abstained: true, modelVersion: "forming-v0.1-demo" },
  ],

  hours: [
    { id: "mer-hrs-1", projectId: "mer-proj-1", scopeItemId: "mer-scope-elec-l1", date: "2026-08-16", hours: 9, sourceSystem: "Vista", normalizationFlags: [] },
    { id: "mer-hrs-2", projectId: "mer-proj-1", scopeItemId: "mer-scope-elec-l1", date: "2026-08-18", hours: 8, sourceSystem: "Vista", normalizationFlags: [] },
    { id: "mer-hrs-3", projectId: "mer-proj-1", scopeItemId: "mer-scope-elec-l2", date: "2026-08-19", hours: 10, sourceSystem: "Vista", normalizationFlags: [] },
    { id: "mer-hrs-4", projectId: "mer-proj-2", scopeItemId: "mer-scope-forming-p1", date: "2026-08-17", hours: 8, sourceSystem: "Vista", normalizationFlags: [] },
    // Two different normalisation problems from a different timekeeping system,
    // because cost-code mess is expected to look different per integration.
    { id: "mer-hrs-5", projectId: "mer-proj-2", scopeItemId: null, date: "2026-08-20", hours: 11, sourceSystem: "Vista", normalizationFlags: ["unmapped_cost_code:03-110", "rounded_to_quarter_hour"] },
  ],

  conditions: [
    { id: "mer-cond-1", captureId: "mer-cap-2", conditionType: "out_of_sequence", description: "Drywall closing walls ahead of electrical sign-off at grid C6", confidence: 0.86 },
    { id: "mer-cond-2", captureId: "mer-cap-5", conditionType: "housekeeping", description: "Form stripping debris across bay 4 access route", confidence: 0.72 },
  ],
};

export const SEED_ORGS: SeedOrg[] = [ORG_A, ORG_B];
