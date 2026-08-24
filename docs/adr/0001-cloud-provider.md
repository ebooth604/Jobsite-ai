# ADR-0001 — Cloud provider: AWS `ca-central-1`

**Status:** accepted — founder-confirmed 2026-08-24.
**Date:** August 2026.
**Supersedes:** the `[DECIDE]` marker in technical plan §3 and open question §13.4.

## Context

Canadian data residency is a hard, contractual commitment (business plan §4.3), not
a preference — all media and derived data must sit in a Canadian region, verified by
explicit configuration rather than a provider default. Technical plan §3 named two
candidates, AWS `ca-central-1` (Montreal) and Azure Canada Central, and left the
choice to founder familiarity and SR&ED-eligible spend patterns.

§13.4 flags this as expensive to change later, because the residency constraint
shapes IAM, networking, and spend tracking. That argues for picking early, not for
picking carefully — the cost is in *deferring* while code accumulates against an
implicit assumption.

## Decision

Default to **AWS `ca-central-1` (Montreal)**.

Reasoning, in order of weight:

1. **Both satisfy residency, so residency does not decide it.** `ca-central-1` and
   Canada Central are both full regions with multiple availability zones. This is a
   tiebreak among acceptable options, not a compliance judgement.
2. **The §3 stack already leans AWS.** ECS/Fargate for containers and Cognito for
   managed auth are named there as the low-ops path for a four-person team. Picking
   AWS keeps those recommendations coherent instead of half-translated.
3. **Breadth of managed services.** A small team's real constraint is ops headcount,
   and the managed-service surface is the thing that substitutes for it.

Explicitly *not* a reason: SR&ED. Whether and how cloud spend factors into a claim
is a question for the founders' accountant, and nothing here should be read as tax
advice or as a finding that one provider is better for it. If that analysis comes
back favouring Azure, it should override this ADR — item 1 above means little else
is at stake.

## Consequences

- Terraform pins `ca-central-1` with a validation rule rejecting any non-`ca-*`
  region, so residency fails at plan time rather than in production.
- Service-level design may assume ECS/Fargate, S3, and Cognito.
- The `[DECIDE]` marker in the technical plan now points here rather than sitting
  unresolved.

## Reversal

**Today: near zero.** No resources exist. Reversing means editing three Terraform
files and this ADR.

**After the first real infrastructure: high**, and rising with every IAM policy,
VPC, and bucket. The provider choice is embedded in identity, networking, and
deployment tooling, none of which port cleanly.

If the founders want Azure, say so **before** infra work starts. That is the whole
reason this is written down rather than assumed.
