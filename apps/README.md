# apps

Applications. Two are user-facing and ship in v1 per technical plan §2 and §10; the
third is internal tooling that is never deployed.

| App | What it is | Plan reference |
|---|---|---|
| `mobile/` | React Native capture app for foremen — iOS + Android from one codebase | §3 (mobile app), §12 Q1 |
| `dashboard/` | PM/ops web dashboard — productivity factors, alerts, evidence packages | §2, §12 Q1–Q4 |
| `trainer/` | Internal labelling tool — builds and audits the training corpus. Local only, never deployed | §5.4, §5.5, §11 |

Apps hold presentation and device concerns only. Anything another surface would
need — reconciliation maths, evidence assembly, cost-code normalization — belongs
in a service, not here.

`trainer/` is the exception that proves the rule: it owns the split-eligibility and
leak checks itself, because the service that will eventually own them —
`services/quantity-ml` — has not started, and §5.4d deserves an enforced rule now
rather than a shared one later. When that service exists, the guards move.
