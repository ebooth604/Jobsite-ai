# ADR-0004 — Infrastructure as code: Terraform, with remote state

**Status:** default.
**Date:** August 2026.

## Context

`infra/terraform/` already pins the AWS provider and validates that the region is
Canadian, but nothing says where state lives. Local state is fine for one person and
catastrophic for two: the first concurrent apply silently diverges, and there is no
lock to notice.

The residency commitment (business plan §4.3) also applies to state. A Terraform
state file contains resource identifiers, and in some cases attribute values that
should not leave the country.

## Decision

- **Terraform** over Pulumi or CDK. The team is TypeScript-heavy, so CDK is
  tempting, but infrastructure is the one place where a declarative diff beats a
  program you have to execute to understand. `terraform plan` is the review artifact.
- **Remote state in S3 `ca-central-1`**, with a DynamoDB lock table, declared as a
  *partial* backend (`backend.tf` names no bucket). Values come from
  `-backend-config` per environment, so the bootstrap bucket can be created before
  the config that references it, and no environment names another's state.
- **State bucket is versioned and encrypted**, and is not managed by the workspace
  it stores state for — the bootstrap is manual and documented, once.

## Consequences

- `terraform init` requires a `-backend-config` file. That friction is deliberate:
  it makes "which environment am I about to change" an explicit answer.
- Locking means a stuck apply needs `force-unlock`, which is a real (rare) operational chore.

## Reversal

**Low today, moderate later.** Swapping the backend is a state migration
(`terraform init -migrate-state`) while there are a handful of resources. Replacing
Terraform with Pulumi once a real environment exists is a rewrite, so this is worth
confirming before the first production apply rather than after.
