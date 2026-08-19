# infra

Infrastructure as code, CI/CD configuration, and environment definitions.

## What lives here

- IaC (Terraform or Pulumi) for the Canadian-region footprint
- GitHub Actions workflows
- Container definitions for the services

## Constraints that bind here

- **Canadian data residency is a contractual commitment, not a preference.** All
  media and derived data stays in a Canadian region, verified through explicit
  bucket and region configuration rather than a provider default. Business plan
  §4.3, technical plan §8.
- Encryption at rest and in transit for all media and reconciliation data.
- Audit logging of who accessed or exported an evidence package — this matters both
  for customer trust and for the package's evidentiary weight.

## Provider — a default, not a settled answer

**AWS `ca-central-1` (Montreal)**, recorded in
[ADR-0001](../docs/adr/0001-cloud-provider.md).

Both candidate regions satisfy residency, so residency does not decide between them;
the §3 stack already leans AWS. The ADR states the reasoning, and states plainly that
reversal is near zero **today** and high once IAM, networking, and buckets exist.
Founders should confirm or override before real resources land.

## Status

`terraform/` holds provider configuration, version pins, and a region guard that
fails validation on any non-`ca-*` region. No compute, storage, or networking yet —
those wait on the technical spike and on confirmation of ADR-0001.
