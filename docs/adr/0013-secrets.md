# ADR-0013 — Secrets: AWS Secrets Manager, and nothing in the repo

**Status:** default.
**Date:** August 2026.

## Context

`.gitignore` already excludes `.env`, keys, and service-account JSON, which handles
accidents. It does not answer where secrets actually live, and that gap is the kind
that gets filled badly under deadline pressure — a connection string pasted into a
CI variable, a KMS key ID in a Slack message.

## Decision

- **AWS Secrets Manager** in `ca-central-1` for runtime secrets, with rotation
  enabled for the database credential.
- **Services read secrets at boot via IAM role**, never from an environment variable
  populated by a human. The task role is the identity; there is no shared password.
- **`.env.example` is committed and contains no values** — only the variable names a
  service needs, so a new engineer learns the shape without learning the contents.
- **CI holds no long-lived AWS keys.** GitHub Actions authenticates via OIDC to a
  role scoped to what a deploy actually needs.

## Consequences

- Local development needs credentials to fetch secrets, or a documented local
  fallback. The fallback must never be the production secret.
- Rotation means services must tolerate a credential changing under them — reconnect
  logic, not a restart.

## Reversal

**Low.** Secrets Manager to SSM Parameter Store or Vault is a change to one loader
module. The property worth preserving through any such change is the one that
matters: secrets are fetched by an identity, never carried in the repo or in a
human's clipboard.
