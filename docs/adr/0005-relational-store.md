# ADR-0005 — Relational store: PostgreSQL, with plain-SQL migrations

**Status:** default.
**Date:** August 2026.

## Context

Technical plan §3 calls for Postgres, and §4 defines a data model that is
relational in the strict sense: the product's whole output is a *join* between
installed quantity, labour hours, and a bid rate. What remains undecided is how the
schema changes over time.

This matters more here than in most projects. §4's non-negotiable constraint — that
no table, column, or view resolves productivity to an individual — is only
enforceable if schema changes are legible in review. An ORM that generates and
applies migrations from model classes makes that constraint hard to see and easy to
erode by accident.

## Decision

- **PostgreSQL 16**, managed (RDS) in `ca-central-1`. One database, not one per
  service. At this scale a well-indexed Postgres is the correct answer for years,
  and the reconciliation join is a transaction, not a distributed query.
- **Plain SQL migrations**, applied in filename order, checked into `db/migrations/`.
  Every schema change is readable as SQL in a diff.
- **No ORM-owned schema.** A query builder or a thin client is fine for reading;
  the schema is not derived from application code.
- **`node-pg-migrate`** as the runner. It is a thin ordering-and-tracking layer over
  SQL files rather than a framework.

## Consequences

- Writing migrations by hand is slower than generating them. That is the trade:
  a privacy constraint enforced by `CHECK` constraints and absent columns is only
  as durable as a reviewer's ability to see it change.
- Rollback is a written `down` migration or a forward fix, not an automatic inverse.

## Reversal

**Low for the runner, high for the approach.** Swapping `node-pg-migrate` for
`dbmate`, `sqitch`, or Flyway is a directory of SQL and a different CLI. Moving to
ORM-managed schema later would mean importing the existing schema and giving up the
review property above — possible, but it should be a decision someone argues for.
