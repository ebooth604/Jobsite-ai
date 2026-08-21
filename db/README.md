# db

Postgres schema for the entities in [technical plan §4](../docs/technical-implementation-plan.md).

Migrations are plain SQL, applied in filename order. A migration tool gets chosen when there is a running service to migrate — see `docs/adr/` for how that decision gets recorded.

## What the schema enforces, so the application doesn't have to

- **No individual-worker productivity.** No table, column, or view resolves quantity or productivity to a person. `captures.captured_by` is the only reference to an individual, is documented as provenance-only, and is never joined to quantity or hours.
- **`captures.origin` is set at ingest.** Held-out measurement sets admit `field` and `self_measured` only, which is what makes the §11 leak test enforceable.
- **Abstentions carry no quantity.** A check constraint keeps `abstained` and `estimated_quantity` consistent, so an abstention can never be read as zero installed.
- **Corrections never overwrite estimates.** Separate table, so the correction is both audit trail and training signal.
- **`budgeted_units_per_hour` is a generated column.** The denominator of every factor cannot drift from the bid it came from.
- **Issued evidence packages have a document.** Immutable once issued; a new version is a new row.
