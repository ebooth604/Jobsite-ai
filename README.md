# Jobsite AI

Project repo for a jobsite AI product sold to **Canadian specialty trade subcontractors** — production tracking from ordinary jobsite photos, joined to labour hours and bid productivity rates, plus contemporaneous evidence packages for change orders and statutory adjudication.

Working title: **Sitewire**.

The repo holds the business plan and a scaffold: the domain model, the API skeleton, the database schema, and the phase-0 accuracy harness. **The product is not built and should not be** until the spike in `spike/` reports honestly — see `docs/architecture.md` §8.

## Layout

```
README.md
apps/api/          core API — TypeScript, node:http for now
packages/domain/   the domain model and the productivity calculation
db/migrations/     Postgres schema
spike/             phase 0 — the accuracy harness. Build this first.
docs/              planning and reference documents
  business-plan.md   the plan — strategy, market, pricing, GTM, financials, risks
  decisions.md       why the plan is shaped this way, and what would reverse each call
  architecture.md    how the system is put together, and the build order
  sitewire-plan.html source for the shareable one-page version
```

## Working on it

```bash
npm install
npm run build --workspace @jobsite/domain   # domain must build before the API typechecks
npm test                                    # domain unit tests
npm run typecheck
npm run dev:api                             # then: curl localhost:3000/health
```

The one endpoint with real logic today is `/productivity` — the arithmetic works with no database and no model, so you can exercise it against real bid numbers during discovery calls. Everything else returns 501 by design; a stub that returns plausible data is how a team convinces itself something works.

## Status

**Plan at v0.3 — August 2026. Pre-seed, pre-incorporation, unvalidated. Scaffold only — no working product.**

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

## Secrets

Never commit credentials. `.gitignore` excludes `.env` files, keys, and service-account JSON from the start. Anything the app needs at runtime belongs in a secret manager or the host's environment config — not in this repo, private or not.
