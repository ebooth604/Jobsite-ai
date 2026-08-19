# packages/shared-types

The entity shapes from technical plan §4, as TypeScript types and schemas shared
across services and the dashboard.

Entities: `Organization`, `Project`, `ScopeItem`, `Capture`, `QuantityEstimate`,
`Correction`, `LabourHoursRecord`, `ProductivityFactor`, `Condition`, `Alert`,
`EvidencePackage`, `WorkerNotice`, `User` / `Role`.

## The constraint this package encodes

**There is no type here that aggregates installed-quantity or productivity data at
the level of an individual worker, and there must never be one.** `Capture.captured_by`
exists as an audit and provenance field only. If a proposed type would make a
worker-level rollup expressible, that is the signal to stop — technical plan §4 and
business plan §4.3.

The schema is where this is enforced. The UI hiding a view is not enforcement.

## Status

Not started. Written once the stack is confirmed — technical plan §3 recommends
TypeScript for the non-ML services but leaves the final call to the technical founder.
