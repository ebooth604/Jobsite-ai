# infra/terraform

Terraform root for the Sitewire footprint.

## What is here now

Provider configuration, version pins, and a **region guard**. Nothing else — no
compute, no storage, no networking. The guard is the point: `var.aws_region` fails
validation unless it is a `ca-*` region, so a misconfigured workspace breaks at
plan time instead of quietly putting jobsite media outside Canada.

Data residency is a contractual commitment (business plan §4.3), so it is enforced
in code rather than left to a provider default or a runbook step.

## Provider

**AWS `ca-central-1` (Montreal)** — chosen as a reversible default, see
[ADR-0001](../../docs/adr/0001-cloud-provider.md). The founders should confirm or
override it before real resources land here; the ADR records what to change and
what it costs.

## Running it

Terraform is not installed in this repo's toolchain and no CI job runs it yet —
both arrive with the first real resources.

```
terraform init
terraform plan -var environment=dev
```
