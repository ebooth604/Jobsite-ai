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

## What exists now

`src/productivity.ts` — the factor arithmetic as pure functions, with tests. No
I/O, so it can be exercised against real bid numbers during discovery calls
before any database exists. It covers:

- `computeProductivityFactor` — budgeted rate, actual rate, factor, and the
  projected overrun the alert quotes
- `assessWindow` — reduces a window of estimates to the quantity that may feed a
  factor, excluding abstentions and low-confidence estimates rather than
  counting them as zero
- `detectDrift` — the sustained-trend rule, which returns nothing far more often
  than it fires

Both modes from §13.2 are designed in: pass `bidHours` for bid-relative, omit it
for the crew-relative cold-start path.

## Status

**The join is not built.** `QuantityEstimate ⋈ LabourHoursRecord ⋈ ScopeItem`,
the persistence of `ProductivityFactor` rows, and the dirty-cost-code refusal are
Q2 work. Only the arithmetic those will call exists today.
