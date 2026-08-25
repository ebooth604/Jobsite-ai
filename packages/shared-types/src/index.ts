/**
 * Shared entity types for SiteWireAi.
 *
 * The full data model from technical plan §4 lands here when that work starts.
 * For now this package exists to prove the toolchain resolves across the
 * workspace, and to pin the one type that already carries a hard constraint.
 */

/**
 * Where a capture came from. Set by the ingestion service at intake and never
 * inferred afterwards.
 *
 * This exists so the accuracy harness can assert that no `"simulated"` capture
 * has leaked into a held-out measurement set. Simulated data may train a model
 * and may never measure one — technical plan §5.4d and §11.
 */
export type CaptureOrigin = "field" | "self_measured" | "simulated";

/** Origins that may appear in a held-out set used to report accuracy. */
export const MEASURABLE_ORIGINS = [
  "field",
  "self_measured",
] as const satisfies readonly CaptureOrigin[];

/**
 * Guard for the leak assertion in the accuracy harness. A capture that fails
 * this must never contribute to a reported accuracy figure.
 */
export function isMeasurableOrigin(origin: CaptureOrigin): boolean {
  return (MEASURABLE_ORIGINS as readonly CaptureOrigin[]).includes(origin);
}
