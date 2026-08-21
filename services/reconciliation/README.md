# services/reconciliation

Joins installed quantity to labour hours and the bid rate to produce a productivity
factor per scope item, per crew, per day.

## What it owns

- The join: `QuantityEstimate` ⋈ `LabourHoursRecord` ⋈ `ScopeItem.budgeted_units_per_hour`
- `ProductivityFactor` records — installed quantity, hours, budgeted rate, actual
  rate, and the factor between them
- Refusing to produce a factor from data flagged dirty upstream

## Constraints that bind here

- **The lowest level of aggregation is the crew, never the individual.** There is
  no table, column, or derived view anywhere in this service that resolves
  productivity to a person. This is enforced in the data model, not the UI
  (technical plan §4).
- **Two modes, both designed in now.** Bid-relative (factor against
  `budgeted_units_per_hour`) is the default; crew-relative trending is the
  cold-start fallback for subs who will not share takeoffs early. Retrofitting the
  second mode later is the expensive path — technical plan §13.2.
- Dirty or unmapped cost codes are surfaced, not silently joined into a factor
  (§11).

## Status

Not started. Q2 deliverable.
