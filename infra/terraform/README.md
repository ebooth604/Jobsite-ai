# infra/terraform

Terraform roots for the SiteWireAi footprint.

## What is here now

Scaffolding, plus **one storage resource**: the training corpus bucket. Still no
compute and no networking. What the scaffolding adds over bare provider config is
the machinery a footprint needs before its first resource — remote state,
environment separation, naming and tagging, and CI that validates all of it.

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
| `corpus.tf` | The training corpus bucket — the first real resource |
| `modules/corpus-bucket/` | Private, encrypted, versioned S3 for redacted jobsite media and ground truth |

The **region guard** remains the point: `var.aws_region` fails validation unless it is
a `ca-*` region, so a misconfigured workspace breaks at plan time instead of quietly
putting jobsite media outside Canada. CI now tests the guard rather than trusting it.

Data residency is a contractual commitment (business plan §4.3), so it is enforced
in code rather than left to a provider default or a runbook step.

## Provider

**AWS `ca-central-1` (Montreal)** — founder-confirmed 2026-08-24, see
[ADR-0001](../../docs/adr/0001-cloud-provider.md). Settled, not a default awaiting
sign-off.

Nothing here has been applied yet. Applying `corpus.tf` is the step that ends the
near-zero reversal cost: after it, a bucket exists and photographs start landing in
it. That is the intended step, not an accident of scope.

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

## The corpus bucket

`modules/corpus-bucket/` holds redacted jobsite photographs, the measured
quantities taken from them, and every export cut. It carries the §8 checklist as
configuration rather than as a runbook step: Block Public Access on, SSE-S3 at
rest, versioning for undo, noncurrent versions expiring at 90 days, and a bucket
policy that **denies** any request arriving without TLS or asking explicitly for no
encryption.

It grants nobody access. The module creates a managed policy scoped to this bucket
and the four operations the trainer performs, and attaches it to nothing — who may
read a corpus of real workers' photographs is a decision that wants a human at the
moment it is made, not a default that shipped with the storage.

After apply:

```bash
terraform output corpus_store_uri   # → s3://sitewireai-dev-corpus/corpus
```

Point the trainer at it with `SITEWIREAI_TRAINER_STORE`; see
[apps/trainer](../../apps/trainer/README.md).

## What comes next

Compute and networking still wait on the technical spike. When they arrive they
land in `modules/` under the constraints listed there.

One thing that is **not** coming next by default: a hosted labelling surface. The
trainer runs locally and talks to this bucket with the labeller's own credentials.
Putting it on the internet means real accounts first — §3 already names Cognito for
this — not a URL first and accounts later.
