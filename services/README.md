# services

Backend services. TypeScript/Node for CRUD and orchestration, Python for the ML
work — technical plan §3.

| Service | Responsibility | Plan reference |
|---|---|---|
| `ingestion/` | Capture intake, face blur, dedupe, validation | §2, §8 |
| `quantity-ml/` | Per-trade CV models, confidence, abstention | §5 |
| `reconciliation/` | quantity ⋈ hours ⋈ bid rate → productivity factor | §2 |
| `alerting/` | Drift detection, correlated-condition mining | §2 |
| `evidence/` | Change-order and adjudication package generation | §6 |
| `integrations/` | Procore, Autodesk, Jonas, Vista, Rhumbix adapters | §7 |
| `notifications/` | Weekly ops digest, in-app alerts | §2 |

Cross-cutting concerns named in §2 but not yet given their own directories —
auth/org/project, correction/feedback, audit log — will land as their own services
or as shared modules once the first two services exist and the seam is visible.
Guessing that boundary now would be premature.

## The rule that shapes these boundaries

A new integration must not require touching reconciliation or alerting. Adapters
map to a common internal `Capture` / `LabourHoursRecord` shape at the edge; the
core services only ever see that shape.
