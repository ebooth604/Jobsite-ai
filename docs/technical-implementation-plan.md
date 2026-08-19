# Sitewire — Technical Implementation Plan

**Companion to: Sitewire Business Plan v0.3 (August 2026).**
**Audience: engineering (including AI coding agents, e.g. Claude Code) starting implementation.**
**Status: pre-build. This is the v1 (first 9 months) technical spec matching Business Plan §4 and §13.**

This document translates the product and roadmap sections of the business plan into an implementable system design. It intentionally leaves several decisions open (marked **[DECIDE]**) where the business plan itself flags the question as unresolved (see Business Plan §17) — do not silently resolve these; surface them back to the founders.

---

## 1. Scope recap (what v1 must do)

From Business Plan §4.1–4.2, v1 must support, for **two trades only** (electrical rough-in, concrete forming/placement):

1. **Capture** — mobile photo/video capture by foremen, plus ingestion of photos already flowing into Procore / Autodesk Build.
2. **Extract** — vision-model quantity estimation against bid scope items, with a confidence band and abstention.
3. **Reconcile** — join installed quantity to daily labour hours (from timekeeping systems) and bid units-per-hour to produce a productivity factor per scope item, per crew, per day.
4. **Alert** — surface productivity drift with a correlated-condition explanation.
5. **Document** — assemble dated, geolocated, photo-backed evidence packages (change order shape and a BC/Ontario-style adjudication export).

Explicitly out of scope for v1 (do not build): 360°/drone/laser capture, full ERP write-back, scheduling/P6 integration, an owner/GC-facing portal, automated regulatory filing, individual worker performance metrics (ever — this is a permanent product constraint, not a v1 deferral), French/Quebec localization.

---

## 2. System architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌───────────────────────┐
│  Mobile Capture  │      │  Photo-sync       │      │  Timekeeping          │
│  App (iOS/       │      │  Connectors       │      │  Connectors           │
│  Android)        │      │  (Procore,        │      │  (Procore, Jonas,     │
│                   │      │  Autodesk Build)  │      │  Vista, Rhumbix)      │
└────────┬─────────┘      └────────┬──────────┘      └───────────┬───────────┘
         │  media + metadata        │  media + metadata            │  hours by cost code
         ▼                          ▼                               ▼
┌─────────────────────────────────────────────────┐      ┌───────────────────────┐
│           Ingestion Service (edge)                │      │  Labour Hours Service │
│  - dedupe, EXIF/geolocation extraction             │      │  - cost-code mapping  │
│  - FACE BLUR at ingest, before persistent storage  │      │  - normalization      │
│  - virus/malware scan, size/type validation        │      │  - dirty-data flags   │
└────────────────────┬──────────────────────────────┘      └───────────┬───────────┘
                      ▼                                                 │
        ┌─────────────────────────┐                                    │
        │   Media Store (Canadian │                                    │
        │   region, encrypted)    │                                    │
        └────────────┬────────────┘                                    │
                      ▼                                                 │
        ┌─────────────────────────────────┐                            │
        │  Quantity Estimation Service      │                           │
        │  (per-trade CV models)            │                           │
        │  - confidence scoring             │                           │
        │  - abstention                     │                           │
        └────────────┬─────────────────────┘                           │
                      ▼                                                 ▼
              ┌───────────────────────────────────────────────────────────┐
              │              Reconciliation Service                        │
              │  quantity ⋈ labour hours ⋈ bid units → productivity factor │
              └────────────────────────┬────────────────────────────────┘
                                        ▼
                      ┌─────────────────────────────────┐
                      │   Alerting Engine                 │
                      │   (drift detection, correlated    │
                      │   condition mining)                │
                      └────────────────┬──────────────────┘
                                        ▼
        ┌────────────────────┐   ┌────────────────────────┐   ┌───────────────────┐
        │  PM/Ops Dashboard    │   │  Evidence Package        │   │  Daily Report      │
        │  (web)               │   │  Generator (change order │   │  Auto-draft         │
        │                       │   │  + adjudication export)  │   │  Service            │
        └────────────────────┘   └────────────────────────┘   └───────────────────┘
```

Cross-cutting services: **Auth/Org/Project** (multi-tenant), **Correction/Feedback** (foreman corrections feed the training pipeline), **Notification** (weekly ops digest email), **Audit Log** (who saw/changed what — matters for evidence-package integrity).

---

## 3. Recommended tech stack

Stack choices below optimize for: a small team (per Business Plan §14, roughly 4 engineering FTEs including 2 ML), Canadian data residency as a hard requirement, and a mobile-first field UX. Treat as a starting recommendation, not dogma — the technical founder should confirm before locking in.

| Layer | Recommendation | Why |
|---|---|---|
| **Mobile app** | React Native (or Flutter) — single codebase for iOS + Android | Small team can't maintain two native codebases; foremen use both platforms |
| **Backend services** | TypeScript (Node) for CRUD/orchestration services; Python for the ML services | Python is non-negotiable for the CV/ML stack; TypeScript keeps the rest of the team fast and lets frontend/backend share types |
| **ML/CV framework** | PyTorch, served via TorchServe or a lightweight FastAPI wrapper | Standard, well-supported, easy to iterate on trade-specific fine-tunes |
| **API layer** | REST + webhooks for integrations; consider GraphQL only if the dashboard's data-fetching complexity justifies it | Don't over-engineer for a v1 with 2 trades and a handful of design partners |
| **Datastore** | PostgreSQL (relational core: orgs, projects, scope items, productivity factors) + object storage for media (photos/video) | Productivity/reconciliation data is fundamentally relational; media is not |
| **Search/analytics** | Defer — Postgres materialized views are sufficient at v1 scale (single-digit to low-double-digit customers) | Don't add Elasticsearch/ClickHouse until there's a proven need |
| **Cloud provider** | AWS `ca-central-1` (Montreal) or Azure Canada Central — **[DECIDE]** based on founder familiarity and SR&ED-eligible spend patterns | Business Plan §4.3 and §8 make Canadian data residency a hard, contractual commitment, not a preference |
| **Face blurring** | On-device (mobile) blur pass where feasible, with a mandatory server-side re-check at ingest before persistent storage — never store an unblurred original | Business Plan §4.3: "faces are blurred at ingest... with the original discarded." This must be enforced twice, because a client-side bug is not an acceptable failure mode for a privacy commitment made in the contract |
| **Auth** | Managed auth provider (e.g. Auth0, AWS Cognito) with org/role-based access control | Don't build auth in-house at this stage |
| **CI/CD** | GitHub Actions → containerized services on ECS/Fargate or Azure Container Apps | Keep ops overhead low for a 4-person eng team |
| **Observability** | Sentry (errors) + a hosted metrics/log stack (Grafana Cloud or Datadog, budget-permitting) | Accuracy and abstention-rate monitoring (see §8) needs first-class telemetry from day one |
| **PDF generation** (evidence packages) | A templating engine (e.g. Puppeteer/HTML-to-PDF, or a dedicated PDF library) driven by structured data, not hand-built per-province documents | §6 below explains why the templates must be data-driven |

---

## 4. Core data model

Entities (fields are illustrative, not exhaustive):

- **Organization** — the subcontractor customer. `id, legal_name, province, trades[], data_region`
- **Project** — a jobsite. `id, org_id, name, address, geolocation, status, start_date`
- **ScopeItem** — a bid line item. `id, project_id, trade, description, unit_of_measure, bid_quantity, bid_hours, budgeted_units_per_hour`
- **Capture** — a photo or video. `id, project_id, area, captured_at, captured_by (foreman user id — used only as an audit/provenance field, never surfaced as a performance metric), geolocation, media_ref, face_blur_status`
- **QuantityEstimate** — model output. `id, capture_id, scope_item_id, estimated_quantity, confidence, abstained (bool), model_version`
- **Correction** — foreman edit of an estimate. `id, quantity_estimate_id, corrected_quantity, corrected_by, corrected_at` — **this is the training signal**, and its weekly count per project is the core quality metric (Business Plan §4.4)
- **LabourHoursRecord** — from timekeeping integration. `id, project_id, scope_item_id (mapped via cost code), date, hours, source_system, normalization_flags`
- **ProductivityFactor** — reconciliation output. `id, project_id, scope_item_id, date, installed_quantity, hours, budgeted_rate, actual_rate, factor (actual/budgeted)`
- **Condition** — a flagged jobsite condition (blocked access, stacked trades, out-of-sequence work, damage). `id, capture_id, condition_type, description, confidence`
- **Alert** — a drift notification. `id, project_id, scope_item_id, severity, message, correlated_conditions[], created_at`
- **EvidencePackage** — an assembled export. `id, project_id, type (change_order | adjudication_bc | adjudication_on), condition_ids[], date_range, generated_pdf_ref, status`
- **WorkerNotice** — the posted privacy notice per project/org (record that it was issued, not personal data about workers).
- **User / Role** — foreman, PM, chief estimator, VP ops, admin. Role gates what's visible; **no role ever sees an individual-worker productivity view, because that view does not exist in the schema.**

**Non-negotiable schema constraint:** there is no table, column, or derived view anywhere in the system that aggregates installed-quantity or productivity data at the level of an individual worker. This is enforced at the data-model level, not just the UI level, per Business Plan §4.3 and the kill-criteria framing in §15 ("union or worker-privacy backlash").

---

## 5. ML pipeline: quantity estimation

1. **Trade-specific models, not one general model.** Business Plan §4.2 is explicit: two trades, not ten, because credibility requires being *right*. Build and evaluate electrical rough-in and concrete forming as separate models with separate accuracy tracking, not a shared multi-class model that averages away weakness in one trade.
2. **Input:** a photo/video frame + area label (from capture metadata) + the project's active scope items for that area/trade.
3. **Output:** estimated installed quantity per matched scope item, a confidence score, and — critically — an **abstain** flag when confidence is below a threshold. An abstention routes to a "needs 30 seconds of foreman input" prompt, not a silent guess (Business Plan §4.4). Abstention threshold should start conservative and be tuned against real accuracy data, not guessed.
4. **Training data — build it so no single firm is load-bearing.** Ground truth comes from three sources, deliberately ordered by how little they depend on a customer's cooperation:

   - **(a) Self-measured sites (primary).** A trade-qualified person walks a site, shoots the photo set, and counts or measures the same scope directly — conduit runs, device boxes, formed area. This is roughly a day of labour per site and it buys ground truth with money instead of goodwill, which means it is available on day one and cannot be withdrawn. Budget this as a real Q1 line item, not a contingency.
   - **(b) One firm's as-builts (calibration anchor).** Exactly one cooperating sub's as-built quantities, used to check that our self-measured numbers agree with how a real subcontractor reports quantity against a real bid — the unit conventions, the rounding, what counts as installed. One firm is enough for that check. Additional firms are welcome and improve coverage, but the plan must not assume them.
   - **(c) Production corrections (ongoing).** Foreman corrections logged against live estimates, once design partners are running. This is the signal that compounds.

   The design rule: **losing any one source degrades precision, not existence.** If the anchor firm withdraws, (a) still produces a measurable accuracy number and (b) becomes an open calibration question rather than a hole where the milestone was. If the self-measured budget gets cut, the anchor still gives a smaller held-out set. What the plan may never do is stake the Q1 accuracy number on three firms all cooperating at once.

   One caveat on (b): a single firm's as-builts encode that firm's install and reporting conventions. Treat the anchor as a calibration check against the self-measured set, never as the training majority — and if they disagree materially, that disagreement is a finding worth reporting to the founders, not an error to average away. See §13.6.
5. **Accuracy targets from the roadmap (Business Plan §13):** ±15% by end of Q1, ±10% by end of Q2. The headline number is measured against the held-out self-measured set (§5.4a), because that is the set we can guarantee exists; the anchor firm's as-builts (§5.4b) are reported *alongside* it as a separate calibration figure, never blended into it. Report both, and never report internal cross-validation as the accuracy number — the gap between cross-validation and real held-out ground truth is the whole risk.
6. **Condition detection** (blocked access, stacked trades, damage, out-of-sequence work) is a secondary model/head, not a stretch goal — it's what feeds the alerting engine's "top correlated condition" output (Business Plan §4.1 step 4) and the evidence packages (step 5). Consider a simpler classifier here before investing in anything more sophisticated than the quantity model itself.

---

## 6. Evidence package generation

The evidence package is the product's renewal driver (Business Plan §4.1: "Step 5 is what gets us renewed"). Build it as **data-driven templates, not hand-coded documents per province**:

- A `EvidencePackage` is generated from a structured record: date range, project, scope items, quantities, hours, and the linked `Capture` + `Condition` records that support the claim.
- Two output shapes for v1: a **change-order package** (works everywhere) and a **BC adjudication export**, explicitly shaped against **Ontario adjudication practice** per Business Plan §3.2 (Ontario is the free specification for the BC product) and validated against the actual BC regulations once finalized (see §9 below — regulations were still in consultation as of mid-2026).
- Do **not** build automated filing to ODACC or a BC nominating authority in v1 — that's explicitly out of scope (Business Plan §4.2). The package is an export the sub or their counsel uses, not a filing system.
- Every figure in a package must be traceable back to its source `Capture` and `LabourHoursRecord` rows — this is the "one click" traceability commitment in Business Plan §4.4, and it's also what makes the package legally credible.
- Design the template schema so a third format (e.g. Alberta) can be added later (Business Plan §13, Y2 H2) without a rewrite — parameterize by jurisdiction rather than hard-coding BC/Ontario logic inline.

---

## 7. Integrations

| Integration | Purpose | Notes |
|---|---|---|
| **Procore** (photo sync + primary target) | Ingest existing photo stream; potential labour-hours source | Start here — Business Plan §13 Q1 lists Procore photo sync as a Q1 deliverable |
| **Autodesk Build** | Ingest existing photo stream | Second priority |
| **Jonas / Vista / Rhumbix** | Labour hours by cost code | Business Plan §13 Q2 milestone. Expect dirty cost-code data (Business Plan §15 risk) — build a normalization/mapping layer, not a naive direct join, and validate against real exports from 3 BC firms before assuming a clean join is possible |

Build connectors as pluggable adapters against a common internal `LabourHoursRecord` / `Capture` interface, so a fifth integration doesn't require touching the reconciliation or alerting logic.

---

## 8. Privacy, security, and residency — implementation checklist

These are contractual commitments in the business plan (§4.3), not aspirational goals. Treat every item below as a launch blocker for its relevant milestone, not a follow-up:

- [ ] Face blurring runs before any image reaches persistent storage; unblurred originals are never written to disk/object storage, even transiently beyond the blur step. Log blur-pass success/failure per capture (`face_blur_status`) and alert on failures.
- [ ] All media and derived data stored in a Canadian cloud region; verify this contractually and technically (bucket/region config, not just provider default).
- [ ] No individual-worker productivity view exists anywhere in the schema, API, or UI — confirm via a code-level audit before each release, not just a design review.
- [ ] Role-based access control enforced at the API layer (not just hidden in the UI).
- [ ] Encryption at rest and in transit for all media and reconciliation data.
- [ ] Audit log of who accessed/exported an evidence package (relevant both for trust and for the package's evidentiary weight).
- [ ] A plain-language worker notice template the customer can generate/post per project (Business Plan §4.3).
- [ ] PIPA (BC) / PIPEDA (federal/other provinces) compliance review before the first design partner goes live; Law 25 is out of scope until Quebec is in scope (Business Plan §11, deferred to year 4+).

---

## 9. Regulatory dependency — do not hard-code prematurely

As of mid-2026, BC's *Construction Prompt Payment Act* regulations were still under industry consultation (through July 7, 2026), with no in-force date or designated adjudication authority yet announced; the discussion paper was still considering standardized forms modeled on Ontario's. **Do not hard-code assumptions about the BC adjudication submission format** — build the BC evidence-package template against Ontario practice as a placeholder (per Business Plan §3.2) and keep it easy to revise once BC's regulations and forms are finalized. Track this as an explicit open dependency, not a completed integration, until the regulations land.

Separately, Ontario's Bill 216/Bill 60 amendments (in force January 1, 2026) decoupled the annual holdback release from lien expiry and introduced a 60-day publish-then-wait mechanism — this is background context for the eventual Ontario expansion (Business Plan §11 Phase 4) and does not block v1 BC-focused work, but the evidence-package schema should be flexible enough to represent a holdback-release notice as a distinct document type when that work starts.

---

## 10. Repo structure (suggested monorepo layout)

```
sitewire/
├── apps/
│   ├── mobile/              # React Native capture app
│   └── dashboard/           # PM/ops web dashboard
├── services/
│   ├── ingestion/           # capture intake, face blur, dedupe
│   ├── quantity-ml/         # Python — CV models, inference API
│   ├── reconciliation/      # quantity + hours + bid → productivity factor
│   ├── alerting/            # drift detection engine
│   ├── evidence/            # evidence package generation
│   ├── integrations/        # Procore, Autodesk, Jonas, Vista, Rhumbix adapters
│   └── notifications/       # weekly digest, in-app alerts
├── packages/
│   ├── shared-types/        # cross-service TS types / schemas
│   └── ui-components/       # shared dashboard components
├── infra/                   # IaC (Terraform/Pulumi), CI/CD configs
└── docs/                    # this plan, ADRs, model accuracy reports
```

---

## 11. Testing & QA — what to instrument from day one

- **Accuracy harness:** automated comparison of model output against held-out ground truth, tracked per trade, per model version, over time. This is the data behind the Q1/Q2 ±15%/±10% milestones and the "accuracy report" sales asset (Business Plan §5.2, §5.3). Run it against the self-measured held-out set (§5.4a) so the harness works regardless of which firms cooperate, and report the anchor firm's as-built comparison (§5.4b) as a separate tracked figure. Two failure modes to alarm on: the two figures diverging (our measuring convention doesn't match the industry's), and either one being quietly replaced by internal cross-validation, which will flatter the model.
- **Abstention rate:** tracked alongside accuracy — a model that's accurate only because it abstains constantly is not meeting the bar.
- **Corrections-per-project-week:** the core quality metric (Business Plan §4.4, §12) — instrument this from the first design partner, and expect (require) it to trend down month over month per customer.
- **Crew-day capture rate:** not purely an engineering metric, but the app should make it directly measurable (captures logged / expected crew-days) since it's a stated kill criterion (Business Plan §15: kill/pivot if capture stays under 50% after 8 weeks).
- **Integration data-quality checks:** flag dirty/unmapped cost codes from labour-hours integrations rather than silently joining bad data into a productivity factor.
- **Evidence package traceability tests:** every generated package should be automatically checked for "does every figure resolve to a source capture/hours record" before it's marked ready to send.

---

## 12. Milestone breakdown (engineering view of Business Plan §13)

| Quarter | Business Plan milestone | Engineering breakdown |
|---|---|---|
| **Q1** | Electrical rough-in model at ±15%; mobile capture w/ face blur; Canadian infra; Procore photo sync; 3 design partners live | Stand up Canadian-region infra + CI/CD; build mobile capture app MVP (capture, geotag, upload, offline queue); build ingestion service with face-blur enforcement; train/evaluate electrical quantity model v0; build Procore photo-sync adapter; basic PM dashboard (raw captures + manual quantity entry as fallback) |
| **Q2** | Labour-hours join; productivity dashboard; auto daily reports; 6 design partners; ±10% accuracy | Build Jonas/Rhumbix adapters + cost-code normalization layer; build reconciliation service; productivity-factor dashboard; auto-drafted daily report generator from captures; iterate electrical model to ±10%; instrument corrections-per-week |
| **Q3** | Evidence packages incl. adjudication export; concrete forming model; first 3 paid conversions | Build evidence-package template engine (change order + BC/Ontario-shaped adjudication export); train concrete forming model; condition-detection model/head; counsel review loop for package templates |
| **Q4** | Alerting engine tuned on real drift events; bid-rate feedback to estimating; 6 paying customers, $220K ARR | Build/tune alerting engine (drift thresholds + correlated-condition surfacing); build bid-rate feedback view for estimators; harden multi-tenant billing/usage tracking for per-project-per-month pricing (Business Plan §10) |
| **Y2 H1** | Third trade; multi-trade expansion in existing accounts | Add third trade model (mechanical piping is a candidate per Business Plan §17 open question — confirm with founders before committing eng time); generalize scope-item/trade config so adding a trade doesn't require reconciliation/alerting code changes |

---

## 13. Open technical questions to raise with the founders before/while building

Mirrors Business Plan §17, translated to engineering impact:

1. **Trade choice (electrical + forming vs. mechanical piping)** — affects which CV model gets built first. Don't start heavy model investment before this is confirmed with discovery data.
2. **Bid takeoff availability** — if subs won't share takeoffs early, the reconciliation service needs a fallback mode (crew-relative trending instead of bid-relative productivity factor). Design the `ProductivityFactor` model to support both modes now rather than retrofitting.
3. **BC adjudication format** — see §9. Build flexible, not final.
4. **Cloud provider (AWS vs. Azure) [DECIDE]** — pick early; changing later is expensive given the Canadian-residency constraint shapes IAM, networking, and SR&ED-eligible spend tracking.
5. **Cold-start accuracy bar** — what confidence threshold triggers abstention should be a tunable config per model version, not hard-coded, since the right threshold will only be known after the Q1 technical spike.
6. **Ground-truth budget and calibration** — §5.4 deliberately does *not* depend on the 3 BC firms all sharing as-builts; it needs a funded self-measurement programme plus at most one cooperating firm as a calibration anchor. That converts an uncontrollable dependency into two answerable questions for the founders:

   - **How many self-measured sites does Q1 fund?** This is a real cost (roughly a day of trade-qualified labour per site, plus travel) and it is not currently in the Business Plan §13 Q1 plan. Too few sites and the held-out set is too small for a ±15% claim to mean anything. Get a number agreed before Q1 scheduling is locked.
   - **Which single firm is the calibration anchor, and is it secured?** One firm, named, with a specific ask — as-builts for scope we can also photograph. This is a far easier conversation than asking three firms for full data-sharing, and it should be run during the Business Plan §16 discovery window rather than assumed as a spike output.

   The residual risk is no longer "we have no ground truth" but "our self-measured convention may not match how subs actually report quantity" — which is exactly what the anchor exists to detect, and which is recoverable by adjusting our measuring rules rather than by finding new data. Worth noting that Business Plan §17 has no equivalent question; if the founders want the as-built conversation tracked as a strategy risk rather than an engineering one, it belongs there too.
