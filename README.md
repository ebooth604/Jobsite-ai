# Jobsite AI

Project repo for a jobsite AI product sold to **Canadian specialty trade subcontractors** — production tracking from ordinary jobsite photos, joined to labour hours and bid productivity rates, plus contemporaneous evidence packages for change orders and statutory adjudication.

Working title: **Sitewire**.

Right now this repo holds the business plan and the technical implementation plan that follows from it. Application code lands here too, at the root, when the build starts.

## Layout

```
README.md          this file
docs/              planning and reference documents
  business-plan.md   the plan — strategy, market, pricing, GTM, financials, risks
  technical-implementation-plan.md
                     the v1 system design — architecture, data model, ML pipeline,
                     privacy checklist, milestones (companion to the business plan)
  sitewire-plan.html source for the shareable one-page version
```

Application code goes at the root when the time comes (`src/`, `package.json`, and so on), leaving `docs/` as the planning record alongside it.

## Status

**Plan at v0.3 — August 2026. Pre-seed, pre-incorporation, unvalidated. No code yet.**

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
