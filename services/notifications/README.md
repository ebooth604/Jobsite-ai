# services/notifications

Outbound messaging. Deliberately small.

## What it owns

- Weekly ops digest email
- In-app alert delivery for the dashboard

## Constraints that bind here

- Digest content is drawn from crew- and project-level aggregates only. The same
  schema-level constraint that governs everything else applies to what gets
  emailed — technical plan §4.

## Status

Not started. Q2 alongside the productivity dashboard.
