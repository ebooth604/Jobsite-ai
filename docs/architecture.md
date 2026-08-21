# Architecture

How the system is put together, and why. Companion to [`business-plan.md`](business-plan.md) and [`decisions.md`](decisions.md) — where those describe *what* we're building and *why that market*, this describes *how*.

**Status: scaffolding.** The interfaces below are real and the domain model is implemented; the vision model behind them is not. Nothing here should be read as "already works."

---

## 1. The shape of the problem

Everything in this system exists to compute one number and defend it:

```
                     installed quantity  (from photos — the hard part)
productivity factor = ─────────────────────────────────────────────────
                     labour hours × bid units-per-hour  (from payroll + the estimate)
```

A factor below 1.0 means the crew is installing work slower than the bid assumed. Detecting that in week 3 rather than week 8 is the product. Everything else — capture, alerts, evidence packages — is either an input to that number or an action taken because of it.

Two consequences for the architecture:

1. **The numerator is a probabilistic estimate and the denominator is exact.** They must never be conflated. Every quantity carries a confidence band and a provenance chain back to source photos; hours do not. The system is explicit about which side of the ratio is soft.
2. **The join is the moat.** Quantity extraction alone is a demo. Quantity joined to that firm's own hours and its own bid rates is the product, and it's what nobody selling to GCs can assemble.

---

## 2. Components

```
┌──────────────┐   photos, video, voice notes
│  Mobile app  │──────────────────────────────┐
│ (Expo/RN)    │                              │
└──────────────┘                              ▼
                                    ┌──────────────────┐
┌──────────────┐   existing photo   │  Ingest service  │
│ Procore /    │───stream (sync)───▶│  · face blur     │  ← blur happens HERE,
│ Autodesk     │                    │  · EXIF/geo      │    before any durable write
└──────────────┘                    │  · dedupe        │
                                    └────────┬─────────┘
                                             │ blurred media + metadata
                                             ▼
┌──────────────┐                    ┌──────────────────┐        ┌─────────────────┐
│ Timekeeping  │   crew-day hours   │   Core API       │◀──────▶│  Vision service │
│ Procore/     │───────────────────▶│   (TypeScript)   │  gRPC/ │  (Python)       │
│ Jonas/Vista/ │   by cost code     │                  │  HTTP  │  quantity est.  │
│ Rhumbix      │                    └────────┬─────────┘        └─────────────────┘
└──────────────┘                             │
                                    ┌────────┴─────────┐
                                    │    Postgres      │   object storage
                                    │  (ca-central-1)  │   (ca-central-1)
                                    └──────────────────┘
```

**Mobile app** — Expo / React Native. One codebase for iOS and Android because field crews carry both, and neither platform is optional in a trade where the foreman's phone is whatever he already owns. Must work offline: jobsites have poor connectivity, and capture that fails on a bad signal is capture that doesn't happen. Queue locally, upload opportunistically.

**Ingest service** — the privacy boundary. Face detection and blurring happen here, before anything durable is written, and the unblurred frame is never persisted. This is a hard architectural constraint, not a setting (§9 of `decisions.md`).

**Core API** — TypeScript/Node. Owns projects, scope items, captures, the hours join, productivity calculation, alerting, and evidence-package assembly. Boring on purpose; the interesting risk is elsewhere.

**Vision service** — Python, separate process. Model work belongs in the Python ecosystem, its scaling profile is completely different from the API's (GPU-bound, bursty, slow), and it is the component most likely to be rewritten. A network boundary here is worth the latency.

**Postgres** — single database, Canadian region. No microservice-per-noun. At the scale this business can reach (§6 of `decisions.md` — a few thousand possible customers), a well-indexed Postgres is the correct answer for years.

---

## 3. Domain model

Implemented in [`packages/domain`](../packages/domain); schema in [`db/migrations`](../db/migrations).

| Entity | What it is | Notes |
|---|---|---|
| `Org` | A subcontractor firm | Tenant boundary. Every query is org-scoped. |
| `Project` | One job | Has many scope items and crews. |
| `ScopeItem` | A bid line: budgeted quantity, unit, budgeted hours | The denominator's source of truth. Comes from the estimate. |
| `Crew` | A named field crew | **The smallest unit of attribution in the system.** |
| `Capture` | One photo or video, post-blur | Provenance root. Geo, area, timestamp, uploader. |
| `QuantityObservation` | An estimated installed quantity for a scope item on a date | Carries confidence, abstention, source captures, and any human correction. |
| `LaborDay` | Hours worked, per crew, per scope item, per date | From timekeeping. Exact. |
| `ProductivitySnapshot` | The computed ratio for a scope item over a window | Derived; recomputed, never hand-edited. |
| `SiteCondition` | A flagged condition (blocked access, stacked trades, out-of-sequence) | The raw material of an evidence package. |
| `EvidencePackage` | An assembled, dated, photo-backed document | For a change order or an adjudication submission. |

### The one thing the model deliberately cannot express

**There is no `Worker` entity, and `LaborDay` has no worker reference.** Hours arrive aggregated to the crew and are stored that way. This is not a permission check or a hidden column — the schema cannot represent per-person productivity, so no future feature request, customer escalation, or well-meaning engineer can quietly add it without a migration that someone has to justify.

That is the point. §9 of `decisions.md` is the only decision in the log with no reversal condition; this is where that commitment is enforced.

---

## 4. How the numbers are computed

Pure functions in `packages/domain/src/productivity.ts`, deliberately free of I/O so they can be tested exhaustively:

```
budgetedUnitsPerHour = budgetedQuantity / budgetedHours
earnedHours          = installedQuantity / budgetedUnitsPerHour
productivityFactor   = earnedHours / actualHours
projectedTotalHours  = budgetedHours / productivityFactor
projectedOverrun     = projectedTotalHours − budgetedHours
```

A factor of 0.71 on a scope budgeted at 780 hours projects ~1,099 hours — a ~319-hour overrun. That is the alert in the plan, and it's a unit test.

**Alerting is deliberately conservative.** A factor computed from a single day is noise. Alerts fire on a sustained trend across a configurable window (default six working days) with a minimum quantity observed, and they suppress while the observations feeding them are low-confidence. Field software dies of false positives, and an alert that cries wolf twice is an alert the PM mutes forever.

---

## 5. Trust and provenance

Three properties every displayed number must satisfy:

1. **Traceable.** A `QuantityObservation` links to the exact captures that produced it. One click from the number to the photos.
2. **Abstaining.** The model reports a confidence band and may decline. An abstention surfaces as "needs 30 seconds of foreman input," never as a silent guess or a zero.
3. **Correctable.** Any quantity is correctable in one tap. Corrections are retained as training signal and as an audit trail — `correctedQuantity` never overwrites `estimatedQuantity`.

**Corrections-per-project-week is the core quality metric** and should fall month over month per customer. If it doesn't, the model isn't learning from the field and the margin curve in the plan won't materialize.

---

## 6. Evidence packages

The renewal feature. An `EvidencePackage` assembles site conditions, the captures that evidence them, the dates, and the affected scope into a document shaped for its destination — a change-order submission, a notice-of-non-payment response, or a statutory adjudication.

Two design constraints:

- **Immutable once issued.** A package is a dated assertion about what the site looked like. It is versioned, never edited in place, or it's worthless in a dispute.
- **Jurisdiction-shaped.** Adjudication regimes differ by province (Ontario since 2019, Alberta 2022, BC newest). The renderer is per-jurisdiction and the content model is shared. Ontario practice informs the BC template — see §11 of `decisions.md`.

---

## 7. Stack, and what it costs us

| Choice | Why | What we give up |
|---|---|---|
| TypeScript / Node (Fastify) | One language across API and mobile; fast hiring in Vancouver | Not the natural home for ML — hence the split |
| Python (FastAPI) for vision | Where the model ecosystem lives | A second runtime, deploy pipeline, and on-call surface |
| Postgres, single instance | Sufficient for this market's scale; transactional joins are the product | Vertical scaling ceiling we will not reach |
| Postgres-backed job queue | One less piece of infrastructure at pre-seed | Will need replacing if inference volume grows past a few thousand jobs/day |
| Expo / React Native | Both platforms, one team | Native camera control is fiddlier than a native app |
| Canadian cloud region | Non-negotiable — see the plan's privacy section | Fewer region options, marginally higher cost |
| npm workspaces monorepo | Shared domain types between API and mobile, atomic changes | Some tooling friction |

**Deferred on purpose:** Kubernetes, microservices, event sourcing, a data warehouse, multi-region, GraphQL. Every one of these is a reasonable thing to want at 100 customers and a mistake at zero.

---

## 8. Build order

Sequenced by risk, not by dependency. **The riskiest thing gets built first**, so it can fail cheaply.

| Phase | What | Why here |
|---|---|---|
| **0 — spike** | [`spike/`](../spike) — accuracy harness against real jobsite photos, one trade | Settles the existential bet. **No product code until this reports honestly.** |
| **1** | Capture + ingest + blur, storage, projects/scope items | Nothing works without media arriving and being made safe |
| **2** | Timekeeping join, productivity calculation, dashboard | The ratio — the actual product |
| **3** | Alerting, auto daily reports | The reason a PM opens it daily |
| **4** | Evidence packages, adjudication export | The reason they renew |
| **5** | Second trade, multi-trade expansion inside accounts | The growth engine, per §6 of `decisions.md` |

Phase 0 is the whole point of the scaffold. If a model cannot count installed conduit from a foreman's ad-hoc photo to ±15%, phases 1–5 are wasted motion, and it is far cheaper to learn that from an evaluation harness than from a built product.
