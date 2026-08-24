# ADR-0008 — Background work: pg-boss on the application database

**Status:** default.
**Date:** August 2026.

## Context

Several things must happen off the request path: the server-side blur re-check,
quantity inference, nightly reconciliation, digest emails, and evidence-package
rendering. These differ wildly in duration — a blur check is seconds, an inference
batch may be minutes.

The reflex is SQS plus a worker fleet. At zero customers that is three pieces of
infrastructure to run, monitor, and pay for before there is a queue depth worth
measuring.

## Decision

**pg-boss**, backed by the Postgres instance from ADR-0005.

- Jobs are rows. They can be inspected with SQL, which during the design-partner
  phase is worth more than throughput.
- Enqueuing a job and writing the row that job is about happen in **one
  transaction**. With an external queue those are two systems and the failure mode
  — a job that references a row that was rolled back — is the kind of bug that
  costs a week.
- Retries, scheduling, and dead-letter handling are built in.

**Explicitly not** running ML inference through this queue. The Python service owns
its own work; pg-boss triggers it and records the outcome. Mixing a GPU-bound
workload into a Postgres-backed queue is how both become slow.

## Consequences

- Queue load and application load share a database. That is fine at v1 volumes and
  is the first thing to watch: sustained queue depth or lock contention is the
  signal to move, not a date on a roadmap.
- Workers are Node processes, deployed like the API.

## Reversal

**Moderate.** Job handlers are plain functions; the swap to SQS or Temporal is the
enqueue call, the runner, and — the real cost — losing transactional enqueue, which
means adding an outbox. Better to move deliberately at a known threshold than to
carry the outbox complexity from day one.
