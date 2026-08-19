# services/quantity-ml

Python. Per-trade computer-vision models that estimate installed quantity from a
capture, plus the condition-detection head that feeds alerting.

## What it owns

- Trade-specific quantity models — electrical rough-in and concrete forming as
  **separate models with separate accuracy tracking**, not one multi-class model
  that averages away weakness in one trade (technical plan §5.1)
- Confidence scoring and the **abstain** flag
- Condition detection (blocked access, stacked trades, damage, out-of-sequence work)
- The accuracy harness: model output vs. held-out ground truth, per trade, per
  model version, over time

## Constraints that bind here

- **Abstention beats a silent guess.** Below threshold, the answer routes to a
  foreman prompt. The threshold is tunable config per model version, never
  hard-coded — the right value is only knowable after the Q1 spike (§5.3, §13.5).
- **Simulated data may train a model and may never measure one.** It is excluded
  from every held-out set and barred from any quoted accuracy figure. The synthetic
  share of each model version's training mix is tracked as a first-class field and
  stated on any accuracy report that leaves the building (§5.4d).
- **The headline accuracy number comes from the self-measured held-out set.** The
  anchor firm's as-builts are reported alongside it as a separate calibration
  figure, never blended in. Internal cross-validation is never the reported
  number (§5.5).
- Abstention rate is tracked alongside accuracy — a model that scores well only by
  abstaining constantly has not met the bar (§11).

## Open before real model investment

Trade choice (electrical + forming vs. mechanical piping) and the Q1 self-measured
site budget are unresolved founder decisions — technical plan §13.1 and §13.6.

## Status

Not started, and deliberately so: the README's rule is that the app does not begin
before the technical spike reports its accuracy honestly.
