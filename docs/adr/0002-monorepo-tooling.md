# ADR-0002 — Monorepo tooling: pnpm, TypeScript, Biome, Vitest

**Status:** default.
**Date:** August 2026.

## Context

Technical plan §3 recommends TypeScript for CRUD and orchestration services with
Python for ML, and §10 lays out a monorepo. It left the final call to the technical
founder. The skeleton needed *some* working toolchain to be more than empty
directories, and an unbuildable repo teaches nobody anything.

## Decision

- **pnpm workspaces** — content-addressed store, strict by default about phantom
  dependencies, and the least ceremonious of the workspace options. Turborepo or Nx
  can be added later if build times justify a task graph; at two workspace members
  they would be pure overhead.
- **TypeScript 7, strict**, plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. Strictness is cheap now and expensive to introduce
  once there is code to fix.
- **Biome** for lint and format together, replacing ESLint + Prettier. One tool, one
  config, no plugin-compatibility upkeep — the right trade for a small team.
- **Vitest** for tests.
- **Project references** (`tsconfig.base.json` + per-package configs) so typecheck
  stays incremental as services land.

`packages/shared-types` is the only TypeScript workspace member so far. It exists to
prove the toolchain resolves end to end, and holds `CaptureOrigin` — the one type
that already carries a hard constraint (technical plan §5.4d).

## Consequences

- `pnpm check` runs typecheck, lint, and tests; CI runs the same commands, so a
  green local run means a green CI run.
- Adding a service means a `package.json`, a `tsconfig.json` extending the base, and
  a reference in the root config.

## Reversal

**Low.** Biome to ESLint + Prettier is a config swap. pnpm to npm or Bun workspaces
is a lockfile regeneration. None of this reaches into application code, which is the
property that made these defaults safe to pick without founder input.
