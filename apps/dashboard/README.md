# apps/dashboard — PM/ops web dashboard

The web surface for project managers, chief estimators, and VP ops.

## What it owns

- Project and scope-item views; raw captures with their estimates
- Productivity-factor views (installed quantity ⋈ hours ⋈ bid rate)
- Alert feed with the correlated-condition explanation
- Evidence-package assembly, review, and export
- Bid-rate feedback view for estimators (technical plan §12, Q4)

## Constraints that bind here

- **Role-based access is enforced at the API layer, not in this UI.** Hiding a
  control is not access control. Technical plan §8.
- **No individual-worker productivity view exists to build.** Not because the UI
  omits it — because no table, column, or derived view in the schema can produce
  it. Technical plan §4.
- Every figure in an evidence package must resolve, in one click, back to its source
  capture and labour-hours rows. Technical plan §6.

## Status

Not started. Q1 scope is deliberately thin: raw captures plus manual quantity entry
as the fallback while the model is still being trained (technical plan §12).
