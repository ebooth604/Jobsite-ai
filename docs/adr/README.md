# Architecture decision records

Each ADR records one decision: what was chosen, why, what it costs, and **how to
reverse it**. Technical plan §10 puts ADRs in `docs/`; this is that.

The rule for this project: a decision the founders have not made is not resolved
silently. It is either left open and marked **[DECIDE]**, or defaulted in an ADR
that says so plainly and states the reversal cost. Everything below is the second
kind — a working default chosen so the build can start, not a settled answer.

| ADR | Decision | Status | Reversal cost |
|---|---|---|---|
| [0001](0001-cloud-provider.md) | AWS `ca-central-1` (Montreal) | Default, awaiting founder confirmation | High once IaC and IAM exist; near zero today |
| [0002](0002-monorepo-tooling.md) | pnpm workspaces, TypeScript, Biome, Vitest | Default | Low |
| [0003](0003-python-toolchain.md) | uv, Ruff, pytest for the ML services | Default | Low |
| [0004](0004-infrastructure-as-code.md) | Terraform, remote state in S3 with DynamoDB locking | Default | Low today; moderate after the first production apply |
| [0005](0005-relational-store.md) | PostgreSQL 16, plain-SQL migrations, no ORM-owned schema | Default | Low for the runner; high for the approach |
| [0006](0006-media-storage.md) | S3 `ca-central-1`, split ingest/media buckets, 24h expiry on unblurred | Default | Low mechanically; **high in principle** — it encodes a contractual promise |
| [0007](0007-api-framework.md) | Fastify with JSON Schema routes | Default | Low |
| [0008](0008-background-jobs.md) | pg-boss on the application database | Default | Moderate — loses transactional enqueue |
| [0009](0009-mobile-app.md) | Expo (React Native), offline-first capture | Default, not urgent | Low now, high once it's in foremen's hands |
| [0010](0010-auth.md) | AWS Cognito, server-side authorization | Default | Moderate — provider change is a user migration |
| [0011](0011-observability.md) | Sentry for errors, OpenTelemetry SDKs, quality metrics in Postgres | Default | Low |
| [0012](0012-pdf-generation.md) | Headless Chromium from HTML templates, version-pinned | Default, not urgent | Low |
| [0013](0013-secrets.md) | AWS Secrets Manager, IAM-fetched, nothing in the repo | Default | Low |

## Which of these actually need a founder decision first

Reversal cost is the ranking, not preference. Three are worth confirming before the
work they govern starts, because they get expensive quietly:

- **0001 (cloud)** — every other infrastructure ADR assumes it.
- **0009 (mobile)** — free to change today, a rewrite plus a redeployment to every
  crew once capture is live.
- **0010 (auth)** — a provider change after the first paying customer is a
  password reset every user sees.

The rest can be changed by whoever is doing the work, on the day they disagree.

## Two decisions that are not really defaults

ADR-0005 and ADR-0006 encode commitments made in a customer contract and in the
decision log's one entry with no reversal condition: no individual-worker
productivity, and no stored unblurred original. The *tools* in those ADRs are
reversible. The properties they enforce are not, and changing them should meet the
same bar as changing the contract.

## Format

Short. Context, decision, consequences, reversal. If an ADR needs more than a page,
the decision probably needs splitting.
