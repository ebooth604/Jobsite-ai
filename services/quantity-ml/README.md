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

## What exists now

`src/quantity_ml/evaluation/` — the accuracy harness, which is phase 0 and
therefore the one part of this service that should exist before the models do.

```bash
uv run python -m quantity_ml.evaluation --dataset data/electrical_roughin_v1.jsonl
```

It reports coverage and abstention rate alongside error, so a model that scored
well by answering only the easy frames cannot look accurate. It refuses to score
a set containing a `simulated` capture — a hard failure, because a leaked sample
makes every number in the report meaningless while still looking plausible. And
it ships with a baseline that ignores the photographs entirely, guessing from the
bid rate alone: the number a real estimator has to beat before anyone can claim
the photographs carry signal.

Exit codes: `0` meets the bar, `1` below it, `2` bad dataset, `3` leak detected.

**It has no data.** The harness needs three firms' photo sets with matching
as-built quantities and bid takeoffs, under NDA. There is deliberately no
synthetic-sample generator — fabricating samples would only measure our own
assumptions.

## Status

**No models, and deliberately so:** the app does not begin before the spike
reports its accuracy honestly. The harness that will report it is ready.
