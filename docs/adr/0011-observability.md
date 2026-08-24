# ADR-0011 — Observability: OpenTelemetry, CloudWatch in-region, and no error vendor yet

**Status:** default. Error-tracking vendor is **[DECIDE]** — see below.
**Date:** August 2026. Supersedes the first draft of this ADR, which named Sentry
without checking whether it could meet the residency commitment. It cannot.

## Context

Technical plan §3 asks for Sentry plus a hosted metrics stack. §11 is more specific
about *what* must be instrumented from day one: accuracy, abstention rate, and
corrections per project-week. Those are not ops metrics — they are the numbers that
decide whether the model is learning, and business plan §12 makes the margin curve a
technical milestone that depends on them falling. A stack chosen only for uptime
will not answer those questions.

Then there is the constraint that decided this ADR. **Sentry offers two data
regions: US (Iowa) and EU (Frankfurt). There is no Canadian region, and the choice
is fixed when the organization is created — changing it means creating a new
organization.** Error payloads are one of the easiest ways for customer data to
leave the country by accident: a stack trace from the ingestion service can carry a
media key, a capture ID, or a project name. Business plan §4.3 makes residency a
contractual commitment, so this is not a detail to settle later with a scrubbing
config.

## Decision

- **OpenTelemetry SDKs** for instrumentation in both the Node and Python services.
  This is the load-bearing choice: instrument against a vendor-neutral API so the
  backend can change without touching instrumented code.
- **CloudWatch Logs and Metrics in `ca-central-1`** as the default backend. Already
  in-region, already in the account, no new vendor and no new sub-processor to
  disclose. It is a worse error-triage experience than a dedicated tool, and that is
  an acceptable trade at zero users.
- **Product-quality metrics are domain events in Postgres**, not log lines —
  `quantity_estimated`, `estimate_corrected`, `estimate_abstained`.
  Corrections-per-project-week is a customer-visible quality number and a training
  signal; it must be queryable and durable, not sampled and expired after 30 days.
  This is unaffected by any vendor decision.
- **No third-party error-tracking vendor is adopted yet.**

## [DECIDE] — the error-tracking question, when it becomes worth solving

Three options, none of which should be chosen before there is real error volume:

1. **Self-hosted Sentry in `ca-central-1`.** Satisfies residency completely. Real
   operational weight — Kafka, ClickHouse, Redis and Postgres — which is a lot for a
   four-person team to run alongside the actual product.
2. **Sentry US with aggressive scrubbing**, disclosed as a sub-processor. Cheapest
   and best DX. Requires accepting that error payloads leave Canada, which
   contradicts a sentence we put in a customer contract, so it needs counsel and an
   explicit decision — not a default.
3. **A vendor with Canadian hosting.** Fewest options and worth a fresh survey when
   the time comes rather than a stale list here.

The recommendation is to defer, run on CloudWatch, and revisit once error volume
makes triage painful. Deferring costs little; picking option 2 quietly costs the
residency claim.

## Consequences

- Two places to look: CloudWatch for "what broke", Postgres for "is the model
  getting better". That split is intentional; the second question outlives any
  vendor.
- CloudWatch's error grouping is poor. Expect to feel this before it is worth fixing,
  and treat that pain as the trigger for the decision above rather than a reason to
  rush it.

## Reversal

**Low, by design.** OpenTelemetry exists precisely so the exporter can be swapped
without touching instrumented code, and the domain events are ours, in our database.
The expensive mistake here would have been the opposite of a tool choice: creating a
Sentry organization in the wrong region, which cannot be changed afterwards.
