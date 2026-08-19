# services/evidence

Assembles dated, geolocated, photo-backed evidence packages. Business plan §4.1
calls step 5 the thing that gets us renewed.

## What it owns

- `EvidencePackage` assembly from structured records — date range, project, scope
  items, quantities, hours, and the supporting `Capture` and `Condition` rows
- Two v1 output shapes: a **change-order package** (works everywhere) and a
  **BC adjudication export** shaped against Ontario practice
- PDF rendering from data-driven templates
- Traceability checks before a package is marked ready to send

## Constraints that bind here

- **Templates are parameterized by jurisdiction, not hard-coded per province.**
  A third format (Alberta, and eventually an Ontario holdback-release notice)
  must be addable without a rewrite — technical plan §6 and §9.
- **BC's adjudication submission format is not settled.** As of mid-2026 the
  *Construction Prompt Payment Act* regulations were still in consultation, with no
  in-force date and no designated authority. Ontario practice is the placeholder,
  and it stays easy to revise. Do not hard-code against it — §9, §13.3.
- **No automated filing in v1.** The package is an export the sub or their counsel
  uses; it is not a filing system to ODACC or a BC nominating authority (§6).
- Every figure must resolve to its source capture and labour-hours rows. This is
  both the "one click" commitment and what makes the package legally credible.

## Status

Not started. Q3 deliverable, with a counsel review loop on the templates.
