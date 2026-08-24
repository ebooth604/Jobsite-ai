# ADR-0012 — Evidence-package rendering: headless Chromium from HTML

**Status:** default. Not urgent — Q3 deliverable.
**Date:** August 2026.

## Context

Technical plan §6 requires that evidence packages be driven by structured data
rather than hand-built per province, because the jurisdictions differ (Ontario since
2019, Alberta 2022, BC newest) and a per-province document would fork on every
regulatory change.

These documents may end up in front of an adjudicator. Two properties matter more
than rendering fidelity: the output must be **reproducible** — the same package ID
must render identically next year — and the content must be **immutable once
issued**.

## Decision

- **HTML templates rendered to PDF by headless Chromium** (Playwright).
- Templates are per jurisdiction; the **content model is shared**, so a new province
  is a template plus a mapping, not a new pipeline.
- **The rendering container pins a Chromium version.** An unpinned browser means
  last year's package re-renders differently, which is exactly the property an
  adjudication document cannot have.
- Rejected LaTeX and Typst: better typography, worse odds that the next engineer can
  change a template. Rejected report-builder SaaS: sends contract-sensitive
  documents to a third party, and residency again.

## Consequences

- A headless browser in production is a heavy dependency with a real patch cadence.
  It runs as a job (ADR-0008), isolated from the API.
- Rendering is deterministic given a package ID: the stored package references
  capture IDs and condition IDs, never live queries, so re-rendering an issued
  package cannot pick up later data.

## Reversal

**Low.** The templates are HTML and the data model is unaffected. Swapping the
renderer changes one job handler.
