# apps

User-facing applications. Two in v1, per technical plan §2 and §10.

| App | What it is | Plan reference |
|---|---|---|
| `mobile/` | React Native capture app for foremen — iOS + Android from one codebase | §3 (mobile app), §12 Q1 |
| `dashboard/` | PM/ops web dashboard — productivity factors, alerts, evidence packages | §2, §12 Q1–Q4 |

Apps hold presentation and device concerns only. Anything another surface would
need — reconciliation maths, evidence assembly, cost-code normalization — belongs
in a service, not here.
