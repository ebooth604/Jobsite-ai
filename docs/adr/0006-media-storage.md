# ADR-0006 — Media storage: S3 in ca-central-1, and the unblurred-original rule

**Status:** default.
**Date:** August 2026.

## Context

Captures are the product's raw material and its largest privacy exposure. Business
plan §4.3 commits, in the contract, that faces are blurred at ingest and the
original is discarded. Technical plan §3 requires that blur be enforced twice,
because a client-side bug is not an acceptable failure mode for a contractual promise.

Storage is where that promise is either kept or quietly broken, so the bucket layout
is a privacy decision, not an ops detail.

## Decision

- **S3 in `ca-central-1`**, SSE-KMS with a customer-managed key, public access
  blocked at the account level, TLS-only bucket policy.
- **Two buckets, not one prefix.** `ingest-staging` receives uploads and is the only
  place an unblurred frame may ever exist; `media` holds blurred captures and is the
  only bucket any service other than ingestion can read.
- **`ingest-staging` has a 24-hour lifecycle expiry**, so an unblurred original
  cannot outlive a failed blur job even if the deletion path has a bug. The
  lifecycle rule is the backstop; explicit deletion after blur is the primary path.
- **Versioning is OFF on `ingest-staging`.** This is deliberate and the opposite of
  the usual default: object versioning would preserve exactly the bytes we have
  promised to discard.
- **Versioning is ON for `media`**, where the retention obligation runs the other
  way — an evidence package must be able to prove what a capture looked like.

## Consequences

- Ingestion is the only service with write access to staging and the only one that
  can move an object to `media`. That boundary is enforced by IAM, not convention.
- A blur failure means the capture is lost after 24 hours rather than stored
  unblurred. That is the correct direction to fail, and the mobile app must treat a
  failed upload as retryable.

## Reversal

**Low mechanically, high in principle.** Moving to another object store is a
migration. Merging the two buckets, or enabling versioning on staging, would break
a commitment made in a customer contract — treat that as requiring the same bar as
changing the contract.
