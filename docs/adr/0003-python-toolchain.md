# ADR-0003 — Python toolchain: uv, Ruff, pytest

**Status:** default.
**Date:** August 2026.

## Context

Technical plan §3 makes Python non-negotiable for the CV/ML stack and suggests
PyTorch served via TorchServe or a light FastAPI wrapper. The service needed a
dependency and test setup before any of that lands.

## Decision

- **uv** for dependency resolution, locking, and virtualenvs. Fast enough that CI
  cold starts stop mattering, and one tool covers what pip, pip-tools, and venv did
  separately.
- **Ruff** for lint and format, mirroring the one-tool choice made for TypeScript in
  ADR-0002.
- **pytest** for tests.
- **`uv.lock` is committed**, so CI installs exactly what a developer ran.

Each Python service owns its own `pyproject.toml` rather than sharing one at the
root. ML services will diverge in their dependency needs — CUDA builds, model
runtimes — and forcing them into one resolution set creates conflicts that have
nothing to do with the code.

`services/quantity-ml` currently holds only `should_abstain`, which is a policy
rule rather than a modelling one: it takes the threshold as an argument rather than
hard-coding it, per technical plan §13.5.

## Consequences

- `uv sync && uv run pytest` in the service directory is the whole workflow.
- CI runs Python as a separate job from TypeScript; neither blocks the other.
- No ML dependencies are pinned yet. PyTorch and the serving choice arrive with the
  first model, after the technical spike.

## Reversal

**Low.** uv reads standard `pyproject.toml`, so moving to Poetry or plain pip is a
lockfile change, not a rewrite. Ruff to Black + Flake8 is a config swap.
