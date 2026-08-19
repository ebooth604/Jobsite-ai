# Jobsite AI

Project repo for a jobsite AI product sold to **Canadian specialty trade subcontractors** — production tracking from ordinary jobsite photos, joined to labour hours and bid productivity rates, plus contemporaneous evidence packages for change orders and statutory adjudication.

Working title: **Sitewire**.

This repo holds the business plan, the technical implementation plan that follows from it, and the directory skeleton those plans describe. The skeleton is structure only — every service directory carries a README naming what it will own and which commitments bind it, and no application code yet.

## Layout

```
README.md          this file
docs/              planning and reference documents
  business-plan.md   the plan — strategy, market, pricing, GTM, financials, risks
  technical-implementation-plan.md
                     the v1 system design — architecture, data model, ML pipeline,
                     privacy checklist, milestones (companion to the business plan)
  sitewire-plan.html source for the shareable one-page version
apps/              user-facing applications
  mobile/            React Native capture app for foremen
  dashboard/         PM/ops web dashboard
services/          backend services
  ingestion/         capture intake, face blur, dedupe
  quantity-ml/       Python — CV models, confidence, abstention
  reconciliation/    quantity + hours + bid rate → productivity factor
  alerting/          drift detection, correlated conditions
  evidence/          change-order and adjudication package generation
  integrations/      Procore, Autodesk, Jonas, Vista, Rhumbix adapters
  notifications/     weekly digest, in-app alerts
packages/          shared libraries
  shared-types/      cross-service types and schemas
  ui-components/     shared dashboard components
infra/             IaC, CI/CD, environment config
```

The layout follows technical plan §10. `docs/` stays alongside the code as the
planning record.

**Every directory is a stub.** Each README states what that piece will own and
which constraints bind it — face blur before persistent storage, no worker-level
aggregation anywhere in the schema, Canadian residency, simulated data barred from
measurement. Writing those down before the code exists is the point: they are
contractual commitments, and they are cheaper to honour by design than to retrofit.

Two things are deliberately absent. There is no root `package.json`, workspace
config, or build tooling, because technical plan §3 leaves the final stack call to
the technical founder. And `infra/` is empty of IaC, because the AWS vs. Azure
choice (§13.4) shapes IAM, networking, and SR&ED spend tracking — scaffolding one
provider would quietly make that decision.

## Status

**Plan at v0.3 — August 2026. Pre-seed, pre-incorporation, unvalidated. Directory skeleton only, no code yet.**

Everything in the plan is an assumption until the 90-day validation plan (§16) marks it otherwise. Figures labelled as estimates are estimates; market counts drawn from the ISED business register are cited as such.

The commit history tracks how the strategy changed:

1. Initial plan — sell to specialty subcontractors rather than general contractors
2. Vancouver, BC home market — BC's prompt payment and adjudication regime
3. Canada-only — national adjudication map, sizing rebuilt from the business register

## The three open bets

1. **Technical** — can a model count installed work from a foreman's ad-hoc phone photo?
2. **Behavioural** — will the foreman take the photo?
3. **Social** — will a unionized workforce accept it?

None is settled by argument. All three are cheap to test, and the 90-day plan tests them before anything gets built. **Don't start the app before the technical spike reports its accuracy honestly** — the whole product rests on that number.

The technical plan describes what gets built *after* that number comes back, and it carries its own open questions (§13) — cloud provider, trade choice, abstention threshold, BC adjudication format. Those are founder decisions, not engineering defaults; the plan marks them **[DECIDE]** rather than resolving them.

## Secrets

Never commit credentials. `.gitignore` excludes `.env` files, keys, and service-account JSON from the start. Anything the app needs at runtime belongs in a secret manager or the host's environment config — not in this repo, private or not.
