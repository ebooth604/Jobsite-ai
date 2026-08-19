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

## Open decision — pick before writing IaC

**AWS `ca-central-1` (Montreal) vs. Azure Canada Central. [DECIDE]**

Technical plan §3 and §13.4 flag this as expensive to change later: the residency
constraint shapes IAM, networking, and SR&ED-eligible spend tracking. This directory
stays empty until the founders choose — scaffolding one provider's IaC now would
quietly make the decision.

## Status

Not started, pending the cloud-provider decision.
