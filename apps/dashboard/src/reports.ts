/**
 * Report definitions and assembly.
 *
 * Templates are parameterized by jurisdiction and audience rather than hard-coded
 * per province, because a third format (Alberta, an Ontario holdback-release
 * notice) has to be addable without a rewrite — technical plan §6, §9.
 *
 * Three constraints from §6 are enforced here rather than left to the renderer:
 *
 *   1. Every figure resolves to its source capture and labour-hours rows. A
 *      package that cannot show its provenance is not marked ready.
 *   2. The BC adjudication shape is PROVISIONAL. As of mid-2026 the Construction
 *      Prompt Payment Act regulations were still in consultation — no in-force
 *      date, no designated authority. Ontario practice is the placeholder, and the
 *      report says so on its face rather than implying a settled format.
 *   3. Nothing here files anything. These are exports a subcontractor or their
 *      counsel uses. Automated filing to ODACC or a BC nominating authority is
 *      explicitly out of scope for v1.
 */

import type {
  Capture,
  Condition,
  LabourHoursRecord,
  ProductivityFactor,
  Project,
  QuantityEstimate,
  ScopeItem,
} from "./types.js";

export type Audience = "court" | "arbitration" | "executive";

export interface ReportKind {
  id: string;
  audience: Audience;
  title: string;
  blurb: string;
  /** Shown as a standing caveat on the report and on its card. */
  caveat?: string;
  /** True when the report quotes figures that must trace to source rows. */
  requiresTraceability: boolean;
}

export const REPORT_KINDS: ReportKind[] = [
  {
    id: "change-order",
    audience: "court",
    title: "Change-order package",
    blurb:
      "Dated, photo-backed record of installed quantity against bid rate, with the jobsite conditions found on the same captures. The everywhere-format used to support a claim.",
    requiresTraceability: true,
  },
  {
    id: "dispute-record",
    audience: "court",
    title: "Dispute record — full provenance",
    blurb:
      "Every figure with its source capture and labour-hours row listed beside it, plus the records deliberately held back and why. Built to be handed to counsel.",
    requiresTraceability: true,
  },
  {
    id: "adjudication-bc",
    audience: "arbitration",
    title: "BC adjudication export",
    blurb:
      "Prompt-payment adjudication export shaped against Ontario practice, which is the closest published specification.",
    caveat:
      "Provisional format. BC's Construction Prompt Payment Act regulations were still in consultation as of mid-2026 — no in-force date and no designated adjudication authority announced. Treat the layout as a working draft to revise once the regulations land, not a filing-ready form.",
    requiresTraceability: true,
  },
  {
    id: "adjudication-on",
    audience: "arbitration",
    title: "Ontario adjudication export",
    blurb:
      "The same structured record laid out against Ontario adjudication practice, where the specification is published.",
    requiresTraceability: true,
  },
  {
    id: "exec-digest",
    audience: "executive",
    title: "Executive ops digest",
    blurb:
      "Portfolio view: which scope items are drifting, how much labour sits behind them, and what is blocked. No individual-worker breakdown exists to report.",
    requiresTraceability: false,
  },
];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  court: "For court / counsel",
  arbitration: "For adjudication & arbitration",
  executive: "For the CEO / exec team",
};

export interface ProjectData {
  project: Project;
  scopeItems: ScopeItem[];
  captures: Capture[];
  estimates: QuantityEstimate[];
  hours: LabourHoursRecord[];
  conditions: Condition[];
  factors: ProductivityFactor[];
}

export interface TraceRow {
  scopeItem: ScopeItem;
  factor: ProductivityFactor;
  captureIds: string[];
  hoursIds: string[];
  /** False when a figure cannot be resolved back to both sources. */
  traced: boolean;
}

/**
 * Resolves every factor to the capture and hours rows behind it. This is the
 * "one click" traceability commitment, and it is what makes a package credible in
 * front of an adjudicator — a number nobody can source is worse than no number.
 */
export function traceFactors(data: ProjectData): TraceRow[] {
  const captureDate = new Map(data.captures.map((c) => [c.id, c.capturedAt]));

  return data.factors.map((factor) => {
    const scopeItem = data.scopeItems.find((s) => s.id === factor.scopeItemId);

    const captureIds = data.estimates
      .filter(
        (e) =>
          !e.abstained &&
          e.scopeItemId === factor.scopeItemId &&
          captureDate.get(e.captureId) === factor.date,
      )
      .map((e) => e.captureId);

    const hoursIds = data.hours
      .filter(
        (h) =>
          h.scopeItemId === factor.scopeItemId &&
          h.date === factor.date &&
          h.normalizationFlags.length === 0,
      )
      .map((h) => h.id);

    return {
      scopeItem: scopeItem as ScopeItem,
      factor,
      captureIds,
      hoursIds,
      traced: Boolean(scopeItem) && captureIds.length > 0 && hoursIds.length > 0,
    };
  });
}

export interface Readiness {
  ready: boolean;
  traced: number;
  total: number;
  heldBack: number;
  abstained: number;
  reason: string;
}

/** A package is only ready when every quoted figure resolves to its sources. */
export function readiness(data: ProjectData, kind: ReportKind): Readiness {
  const rows = traceFactors(data);
  const traced = rows.filter((r) => r.traced).length;
  const heldBack = data.hours.filter((h) => h.normalizationFlags.length > 0).length;
  const abstained = data.estimates.filter((e) => e.abstained).length;

  if (!kind.requiresTraceability) {
    return {
      ready: rows.length > 0,
      traced,
      total: rows.length,
      heldBack,
      abstained,
      reason:
        rows.length > 0
          ? "Summary report — no per-figure traceability requirement."
          : "Nothing reconciled yet, so there is nothing to summarise.",
    };
  }

  if (rows.length === 0) {
    return {
      ready: false,
      traced,
      total: 0,
      heldBack,
      abstained,
      reason: "No reconciled figures yet — this project has no captures joined to labour hours.",
    };
  }

  if (traced < rows.length) {
    return {
      ready: false,
      traced,
      total: rows.length,
      heldBack,
      abstained,
      reason: `${rows.length - traced} of ${rows.length} figures cannot be resolved back to both a capture and an hours record.`,
    };
  }

  return {
    ready: true,
    traced,
    total: rows.length,
    heldBack,
    abstained,
    reason: `All ${rows.length} figures resolve to their source capture and hours rows.`,
  };
}

export const reportKind = (id: string): ReportKind | undefined =>
  REPORT_KINDS.find((r) => r.id === id);
