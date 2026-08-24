# infra/terraform

Terraform roots for the Sitewire footprint.

## What is here now

Scaffolding, and still **no compute, storage, or networking**. What the scaffolding
adds over bare provider config is the machinery a footprint needs before its first
resource: remote state, environment separation, naming and tagging, and CI that
validates all of it.

| Path | What it is |
|---|---|
| `versions.tf`, `providers.tf` | Version pins and the AWS provider, tagged from `locals.tf` |
| `variables.tf` | `aws_region` (region guard) and `environment` |
| `locals.tf` | `name_prefix` and `common_tags` — defined once, inherited everywhere |
| `outputs.tf` | Region, environment, prefix, tags |
| `backend.tf` | S3 remote state, configured **partially** — see below |
| `backends/*.s3.tfbackend` | Per-environment bucket and lock table |
| `envs/*.tfvars` | Per-environment variable values |
| `bootstrap/` | The one root with local state: creates the state bucket and lock table |
| `modules/` | Empty by design — [why](modules/README.md) |

The **region guard** remains the point: `var.aws_region` fails validation unless it is
a `ca-*` region, so a misconfigured workspace breaks at plan time instead of quietly
putting jobsite media outside Canada. CI now tests the guard rather than trusting it.

Data residency is a contractual commitment (business plan §4.3), so it is enforced
in code rather than left to a provider default or a runbook step.

## Provider

**AWS `ca-central-1` (Montreal)** — founder-confirmed 2026-08-24, see
[ADR-0001](../../docs/adr/0001-cloud-provider.md). Settled, not a default awaiting
sign-off.

Nothing in this directory has been applied yet, so reversal is still near zero. It
stops being free the moment `bootstrap/` applies — which is now a scheduling
question rather than a decision one.

## Environment separation

State is separated by backend config, not by workspaces. Each environment gets its
own bucket, so a credential scoped to dev cannot read prod state — a property
`terraform workspace` does not give you, since all workspaces share one bucket.

The cost is that `init` needs a flag, and the wrong flag is silent. The `-reconfigure`
in the commands below is what makes switching environments safe.

## Running it

Terraform is not installed in this repo's toolchain; the version is pinned in
`.terraform-version` for `tfenv`/`mise` and read by CI.

Everything below assumes the `sitewire` profile:

```bash
export AWS_PROFILE=sitewire
```

**First time in an environment** — create its state bucket and lock table:

```bash
cd bootstrap
terraform init
terraform apply -var environment=dev
```

**Then, and for every run after** — the main root:

```bash
terraform init -reconfigure -backend-config=backends/dev.s3.tfbackend
terraform plan -var-file=envs/dev.tfvars
```

Swap `dev` for `staging` or `prod` in **both** flags together. Mismatching them
points one environment's state at another's bucket.

## What comes next

Compute, storage, and networking still wait on the technical spike and on
confirmation of ADR-0001. When they arrive they land in `modules/` under the
constraints listed there — and media buckets carry the §8 checklist items
(encryption, versioning, public-access block, audit logging) as launch blockers.
