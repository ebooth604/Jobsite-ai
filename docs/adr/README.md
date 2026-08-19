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

## Format

Short. Context, decision, consequences, reversal. If an ADR needs more than a page,
the decision probably needs splitting.
