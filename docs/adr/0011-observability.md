# ADR-0011 — Observability: Sentry for errors, OpenTelemetry for everything else

**Status:** default.
**Date:** August 2026.

## Context

Technical plan §3 asks for Sentry plus a hosted metrics stack, and §11 is more
specific about *what* must be instrumented from day one: accuracy, abstention rate,
and corrections per project-week. Those are not ops metrics. They are the numbers
that decide whether the model is learning, and business plan §12 makes the margin
curve a technical milestone that depends on them falling.

A stack chosen only for uptime will not answer those questions.

## Decision

- **Sentry** for errors and traces in both the Node and Python services. One tool
  across both runtimes, and the Python SDK is good.
- **OpenTelemetry SDKs** for instrumentation, exporting to Sentry today. This is the
  point of the decision: instrument against a vendor-neutral API so the backend can
  change without touching instrumented code. A hosted metrics vendor is deferred
  until there is something to page on.
- **Product-quality metrics are emitted as domain events, not log lines** —
  `quantity_estimated`, `estimate_corrected`, `estimate_abstained` — written to
  Postgres, not only to a telemetry vendor. Corrections-per-project-week is a
  customer-visible quality number and a training signal; it must be queryable and
  durable, not sampled and expired after 30 days.

## Consequences

- Two places to look: Sentry for "what broke", Postgres for "is the model getting
  better". That split is intentional; the second question outlives any vendor.
- Sentry must be configured to scrub aggressively. A stack trace from the ingestion
  service can carry a media key or a capture ID, and error payloads are one of the
  easiest ways for data to leave the country by accident.

## Reversal

**Low.** OpenTelemetry exists precisely so the exporter can be swapped. The domain
events are ours, in our database, and unaffected by any vendor decision.
