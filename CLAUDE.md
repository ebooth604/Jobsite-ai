# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.

---

## Project deviations from the guidance above

Recorded here rather than silently ignored.

- **Infrastructure as code is Terraform, not CDK or CloudFormation.** The
  guidance above prefers CDK/CloudFormation; [ADR-0004](docs/adr/0004-infrastructure-as-code.md)
  chose Terraform deliberately, because `terraform plan` is the review artifact
  and a declarative diff beats a program you must execute to understand. Follow
  the ADR.
- **Region is `ca-central-1` (Montreal)** — [ADR-0001](docs/adr/0001-cloud-provider.md).
  Canadian data residency is a contractual commitment (business plan §4.3), not a
  default. `infra/terraform/variables.tf` fails at plan time on any non-`ca-*`
  region, and that validation is intentional. Do not relax it.
- **Secrets follow [ADR-0013](docs/adr/0013-secrets.md)** — fetched by IAM role at
  boot, never committed, never pasted into an environment variable by a human. The
  Secret Safety rules above are compatible and stricter; follow both.

## Before doing AWS work here, read

- [`docs/adr/README.md`](docs/adr/README.md) — the toolchain decisions and, more
  usefully, the reversal cost of each.
- [`docs/business-plan.md`](docs/business-plan.md) §4.3 — why residency and worker
  privacy are contractual rather than preferences.

## The one rule that overrides convenience

There is no individual-worker productivity metric anywhere in this system, and no
unblurred capture is ever stored. Both are enforced in the schema and the bucket
layout, not in the UI. If a task seems to require either, stop and raise it — do
not work around it.
