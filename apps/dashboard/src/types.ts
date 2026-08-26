/**
 * Demo-scoped subset of the technical plan §4 data model.
 *
 * Only the entities the investor demo actually renders are here. The full model
 * belongs in @sitewireai/shared-types when the real services exist; duplicating it
 * now would create two sources of truth for a schema that is still moving.
 *
 * `CaptureOrigin` is deliberately imported rather than redeclared — it is the one
 * type carrying an enforced constraint (§5.4d, §11), and a local copy would let a
 * simulated capture slip past `isMeasurableOrigin`.
 */

import type { CaptureOrigin } from "@sitewireai/shared-types";

export interface ScopeItem {
  id: string;
  projectId: string;
  trade: string;
  description: string;
  unitOfMeasure: string;
  bidQuantity: number;
  /** The estimator's assumed install rate. Denominator of the productivity factor. */
  budgetedUnitsPerHour: number;
}

export interface Capture {
  id: string;
  projectId: string;
  area: string;
  capturedAt: string;
  /**
   * Provenance only. Technical plan §4 is explicit that this is never surfaced as
   * a performance metric, and §4.3 forbids any per-worker productivity view from
   * existing at all — so nothing in this app groups by it.
   */
  capturedBy: string;
  origin: CaptureOrigin;
}

export interface QuantityEstimate {
  id: string;
  captureId: string;
  scopeItemId: string;
  /**
   * Null when there is no measurement — which is not the same as a measured
   * zero, and must never be summed as one. `isCountableEstimate` is the guard.
   */
  estimatedQuantity: number | null;
  confidence: number;
  /** A model that declines to guess. Counted, never silently treated as zero. */
  abstained: boolean;
  modelVersion: string;
}

export interface LabourHoursRecord {
  id: string;
  projectId: string;
  scopeItemId: string | null;
  date: string;
  hours: number;
  sourceSystem: string;
  /** Unmapped cost codes and the like — surfaced, never quietly joined (§11). */
  normalizationFlags: string[];
}

export interface Condition {
  id: string;
  captureId: string;
  conditionType: string;
  description: string;
  confidence: number;
}

export interface ProductivityFactor {
  scopeItemId: string;
  date: string;
  installedQuantity: number;
  hours: number;
  budgetedRate: number;
  actualRate: number;
  /** actual / budgeted. Below 1.0 means installing slower than bid. */
  factor: number;
}

export interface Alert {
  id: string;
  scopeItemId: string;
  severity: "info" | "warning" | "critical";
  message: string;
  correlatedConditions: Condition[];
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  address: string;
  province: string;
  dataRegion: string;
}
