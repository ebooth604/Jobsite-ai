# services/integrations

Pluggable adapters for the systems a subcontractor already runs.

| Adapter | Purpose | Priority |
|---|---|---|
| Procore | Photo sync; possible labour-hours source | First — Q1 deliverable |
| Autodesk Build | Photo sync | Second |
| Jonas / Vista / Rhumbix | Labour hours by cost code | Q2 |

## What it owns

- Per-system adapters that map external payloads to the internal `Capture` and
  `LabourHoursRecord` shapes
- Cost-code mapping and normalization
- Data-quality flags for dirty or unmapped codes

## Constraints that bind here

- **Adapters absorb the mess; core services never see it.** A fifth integration
  must not require touching reconciliation or alerting — technical plan §7.
- **Expect dirty cost-code data and build for it.** A naive direct join is the
  wrong design; validate the mapping layer against real exports before assuming a
  clean join is possible (business plan §15 risk, technical plan §7).
- Unmapped codes are flagged and withheld from reconciliation rather than joined
  into a productivity factor that looks authoritative and is not (§11).

## Status

Not started. Procore photo sync is the Q1 deliverable.
