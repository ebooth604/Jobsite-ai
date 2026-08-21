/**
 * The domain model.
 *
 * One rule governs this file, and it is architectural rather than stylistic:
 * there is no `Worker` entity and no per-person attribution anywhere. Labour
 * arrives aggregated to a crew and is stored that way. The model *cannot*
 * express individual productivity, which is the point — see docs/decisions.md §9.
 */

export type OrgId = string & { readonly __brand: 'OrgId' };
export type ProjectId = string & { readonly __brand: 'ProjectId' };
export type ScopeItemId = string & { readonly __brand: 'ScopeItemId' };
export type CrewId = string & { readonly __brand: 'CrewId' };
export type CaptureId = string & { readonly __brand: 'CaptureId' };

/** ISO-8601 calendar date, no time component: "2026-08-21". */
export type IsoDate = string;

/** Units of measure a takeoff actually uses. Trade-specific by design. */
export type Unit =
  | 'LF'    // linear feet — conduit, pipe, cable tray
  | 'EA'    // each — devices, fixtures, hangers
  | 'SF'    // square feet — formwork contact area, drywall
  | 'CY'    // cubic yards — concrete placement
  | 'LB'    // pounds — rebar
  | 'CWT';  // hundredweight

export type Trade = 'electrical' | 'concrete_forming' | 'mechanical';

/** A subcontractor firm. The tenant boundary: every query is org-scoped. */
export interface Org {
  id: OrgId;
  name: string;
  trades: Trade[];
}

export interface Project {
  id: ProjectId;
  orgId: OrgId;
  /** The firm's own job number — how everyone on site refers to it. */
  jobNumber: string;
  name: string;
  startedOn: IsoDate;
}

/**
 * One line of the bid: how much work, and how many hours the estimator
 * assumed it would take. The denominator of the productivity ratio comes
 * from here, so a project without scope items can only trend against itself.
 */
export interface ScopeItem {
  id: ScopeItemId;
  projectId: ProjectId;
  trade: Trade;
  /** e.g. "Level 2 branch conduit, east" */
  description: string;
  costCode: string;
  budgetedQuantity: number;
  unit: Unit;
  budgetedHours: number;
}

export interface Crew {
  id: CrewId;
  projectId: ProjectId;
  /** e.g. "Rough-in crew A". Never a person's name. */
  name: string;
}

/**
 * One photo or video after face blurring. The provenance root: every
 * quantity the system reports traces back to a set of these.
 *
 * `blurredAt` is non-optional on purpose — a Capture cannot exist in an
 * unblurred state, because ingest blurs before the first durable write and
 * discards the original.
 */
export interface Capture {
  id: CaptureId;
  projectId: ProjectId;
  capturedAt: string;
  blurredAt: string;
  /** Storage key in the Canadian-region bucket. */
  mediaKey: string;
  /** Free-text area as the crew describes it: "L2 east", "core". */
  area?: string;
  geo?: { lat: number; lon: number; accuracyM: number };
}

/**
 * An estimated installed quantity for one scope item on one date.
 *
 * The estimate is probabilistic and says so. `abstained` is a first-class
 * outcome, not an error: the model declining is a prompt for 30 seconds of
 * foreman input, never a silent zero.
 *
 * A human correction never overwrites the estimate — both are retained, so
 * corrections are both an audit trail and training signal.
 */
export interface QuantityObservation {
  id: string;
  scopeItemId: ScopeItemId;
  observedOn: IsoDate;
  estimatedQuantity: number;
  unit: Unit;
  /** 0–1. Model's own confidence in the estimate. */
  confidence: number;
  /** Half-width of the reported band, same unit as the quantity. */
  confidenceBandHalfWidth: number;
  abstained: boolean;
  /** Every capture that fed this number. Never empty unless abstained. */
  sourceCaptureIds: CaptureId[];
  /** Set when a foreman corrects it. Does not replace estimatedQuantity. */
  correctedQuantity?: number;
  correctedAt?: string;
}

/**
 * Hours worked, from the timekeeping system. Exact, unlike the quantity
 * side of the ratio.
 *
 * Attributed to a crew. There is deliberately no `workerId` here, and adding
 * one requires a migration someone has to justify.
 */
export interface LaborDay {
  id: string;
  projectId: ProjectId;
  scopeItemId: ScopeItemId;
  crewId: CrewId;
  workedOn: IsoDate;
  hours: number;
}

export type ConditionKind =
  | 'blocked_access'
  | 'stacked_trades'
  | 'out_of_sequence'
  | 'incomplete_predecessor'
  | 'damage'
  | 'differing_condition';

/** A flagged site condition — the raw material of an evidence package. */
export interface SiteCondition {
  id: string;
  projectId: ProjectId;
  scopeItemId?: ScopeItemId;
  kind: ConditionKind;
  observedOn: IsoDate;
  note: string;
  captureIds: CaptureId[];
  /** Set once someone judges it chargeable. Drives evidence assembly. */
  billable?: boolean;
}

/** Provinces whose statutory adjudication regimes we render packages for. */
export type Jurisdiction = 'BC' | 'AB' | 'ON' | 'SK' | 'MB' | 'FEDERAL';

export type EvidencePurpose = 'change_order' | 'notice_response' | 'adjudication';

/**
 * A dated assertion about what the site looked like. Immutable once issued
 * and versioned rather than edited — a package that can be quietly changed
 * after the fact is worthless in a dispute.
 */
export interface EvidencePackage {
  id: string;
  projectId: ProjectId;
  purpose: EvidencePurpose;
  jurisdiction: Jurisdiction;
  issuedAt: string;
  version: number;
  conditionIds: string[];
  scopeItemIds: ScopeItemId[];
  periodStart: IsoDate;
  periodEnd: IsoDate;
}
