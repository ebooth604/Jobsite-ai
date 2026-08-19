# services/alerting

Detects productivity drift and explains it with the correlated jobsite condition.

## What it owns

- Drift detection over `ProductivityFactor` series, per scope item and crew
- Correlating drift against `Condition` records from the detection head
- `Alert` records with severity, message, and the conditions that explain them

## Constraints that bind here

- An alert without an explanation is noise a PM learns to ignore. The correlated
  condition is the product, not a garnish — technical plan §2 and business plan
  §4.1 step 4.
- Thresholds are tuned against real drift events, not chosen up front (§12, Q4).

## Status

Not started. Q4 deliverable — it needs real productivity history to tune against.
