# Decision log

Why the plan is the way it is. Each entry records what was decided, what was rejected, and — most importantly — **what would reverse it**. A decision without a reversal condition is a belief, not a decision.

Status of every entry below: **provisional**. Nothing here has survived contact with a paying customer. Dates are when the call was made, not when it was validated.

---

## 1. Sell to specialty subcontractors, not general contractors or owners

*August 2026*

**Decision.** The customer is a self-performing specialty trade subcontractor doing $10–150M. There is no GC-facing or owner-facing product, and won't be.

**Why.** Every well-funded company in jobsite AI — OpenSpace, Buildots, DroneDeploy, Disperse, Doxel, Trunk Tools — sells visibility *into* the sub's work, to the party that manages the sub. That tier is well capitalized and largely won. The sub is a different market with a different buyer, different data, and a different value event: the sub carries the labour risk, eats the rework, and loses the change-order argument for lack of evidence.

The deeper reason is defensibility. The productivity ratio we compute needs **both** installed quantity and labour hours against bid rates. Only the sub has both. A GC never sees its subcontractor's bid productivity assumptions or payroll. So the dataset that compounds here can only be assembled by someone selling to subs — which means the incumbents cannot build it without changing who they sell to.

**Rejected.** Selling progress verification to GCs (crowded, and we'd have no data advantage). Selling to owners (enterprise motion, months-long deploys, wrong shape for a company this size).

**What would reverse it.** Pilot economics. If subs prove unable or unwilling to pay near the modelled ACV while GCs pull the product toward them, follow the money — but only on evidence, not on the first hard quarter. Hold the question open rather than defending the thesis past the point of evidence.

---

## 2. Ordinary phone photos — no 360° rig, no drone, no BIM

*August 2026*

**Decision.** Capture is whatever the crew already does: phone photos, short walk videos, or the existing photo stream in Procore or Autodesk Build.

**Why.** Every competitor requires hardware or a model our buyer doesn't have. A mid-market sub has no BIM model of its own, no reality-capture budget, and no appetite for a rig. The constraint is the wedge: it's the only way this product reaches a $40M contractor at a price they'll pay.

**Rejected.** Helmet cams and 360° capture (better data, wrong buyer). Requiring a BIM model (Buildots' approach; assumes a GC-tier customer).

**What would reverse it.** If accuracy from ad-hoc photos proves unreachable (see §9) *and* a cheap capture aid — a clip-on lens, a fixed corner camera — closes the gap without changing the buyer's economics. Adding hardware is a last resort, not a roadmap item.

---

## 3. Two trades only: electrical rough-in and concrete forming

*August 2026*

**Decision.** Quantity models for two trades in v1, not a general-purpose construction vision model.

**Why.** Quantity estimation is irreducibly trade-specific. Credibility with a $40M electrical contractor requires being *right*, not broad — one wrong number in a pilot ends the relationship. Electrical has the best quantity structure and the worst rough-in visibility, so the value is highest. Concrete forming is the most visually tractable scope and Metro Vancouver's high-rise pipeline has a dense cluster of forming subs.

**Rejected.** Breadth across six trades (accuracy would be uniformly mediocre). Starting with drywall or finishes (easy to see, low change-order density, less money at stake).

**What would reverse it.** Discovery data. Mechanical piping may beat both in BC's institutional pipeline, and concrete forming is exposed to the projected BC residential slowdown. This is the decision most likely to change, and it should change on evidence rather than preference.

---

## 4. Base the company in Vancouver, BC

*August 2026*

**Decision.** Vancouver, with Metro Vancouver and the Fraser Valley as the beachhead market.

**Why.** As a CCPC, the federal SR&ED refundable ITC at 35% (to the enhanced $6M expenditure limit) plus BC's 10% refundable credit returns a large fraction of engineering salary as cash rather than a deduction — on a business whose burn is 55% engineering, that is the single strongest financial argument for the location. IRAP and Mitacs sit on top. BC's Investment Capital Program gives BC investors a 30% refundable credit for investing in a registered EBC, which makes our ideal angels — Lower Mainland contractors who feel the problem viscerally — materially cheaper to raise from. And a founder can stand in four jobsite trailers in a day, which the design-partner phase depends on.

**Costs accepted.** A thinner pre-seed capital market than Seattle or SF, and distance from the category's centre of gravity, which is US-based.

**What would reverse it.** Nothing short of the SR&ED position collapsing. Register as an EBC before the angel round; get a specialist opinion on eligibility before relying on the modelled refund.

---

## 5. Canada only, at least initially

*August 2026*

**Decision.** No US selling. Expansion runs Vancouver → Alberta (M12) → Ontario (M24), with Quebec deferred past year 4.

**Why.** Canada has spent seven years building a province-by-province statutory adjudication regime for construction payment disputes — Ontario since 2019 (amended January 2026 to require annual holdback release), Alberta and Saskatchewan since 2022, Manitoba, the federal regime, and now BC. Adjudication resolves disputes in weeks and rewards whoever has contemporaneous documentation. That makes Canada the most adjudication-dense construction market in the world, and it is the home market.

Sequencing follows from it: BC's regime is newest, so attention is high and documentation habits are unformed — the moment a sub is most willing to change. Ontario has four times the ICP firms and a settled regime. **Land where the urgency is, expand to where the volume is.**

Quebec is deferred despite ~715 ICP firms: it needs French-language product and support under the Charter of the French Language, Law 25 compliance, and a distinct construction-law culture — and it still has no general adjudication regime. A deliberate project, not an extension.

**What would reverse it.** Nothing in the plan depends on the US, and no milestone assumes it. If the constraint relaxes later, the same product sells into a market roughly six times larger. Ordering between Alberta and Ontario should flip if Ontario discovery shows the adjudication channel already sells itself there.

---

## 6. The market is ~$256M, and that caps the company

*August 2026 — supersedes an earlier, wrong estimate*

**Decision.** Size the market bottom-up from the ISED business register (NAICS 238) rather than from a category headline: ~3,200 Canadian ICP firms, ~$256M SAM, ~$26M in Metro Vancouver. Year-5 SOM ~$36M ARR.

**Correction on the record.** Earlier drafts estimated the BC firm count by hand and were materially too low. The register data replaced the guess. The remaining soft number is the "upper slice of small firms" column — how many 5–99-employee firms clear $10M revenue — which a StatCan revenue-band pull should replace in the first 30 days.

**What follows, and it is structural.** A 3,200-firm market means **the company cannot grow on new-logo velocity** — logo count runs out at any believable win rate. Consequences, all of which are design constraints rather than sales tactics:

- Expansion revenue is the growth engine. NRR above 120% is the model, not a vanity metric.
- Multi-trade support and per-project expansion move *earlier* in the roadmap than a US-market plan would put them.
- Churn is disproportionately expensive: every lost account is also a lost reference in a community where everyone knows everyone.
- Depth per account beats breadth of product.
- The honest exit is a strategic acquisition — Procore, Autodesk, Trimble, a Canadian consolidator — not an IPO.

**What would reverse it.** Better firm-count data, or a materially higher ACV than modelled. Note that the *shape* of the conclusion survives moderate error in the count: even at 5,000 firms this is not a fund-returning outcome for a large VC, which is a fact to state to investors upfront rather than let them discover.

---

## 7. Price per active project, never per seat

*August 2026*

**Decision.** $475/project/month (Core), $700 (Plus), $16K for a 90-day pilot. Annual, paid upfront where possible.

**Why.** Seat pricing punishes the customer for putting more crew on capture — exactly the behaviour our data quality depends on. Project pricing scales with delivered value and matches how a sub already thinks about cost coding. And since ACV growth per account is the growth model (§6), the expansion path belongs in the first contract: pricing that makes the fifth, tenth and twentieth project obviously worth adding.

**What would reverse it.** Little. If anything, pricing power should rise once dollar-recovery evidence accumulates.

---

## 8. No contingency or success-fee pricing on recovered dollars

*August 2026*

**Decision.** We do not take a percentage of recovered change orders or adjudication awards, however well it would demo.

**Why.** It is the pricing the value story begs for, and it turns the company into a claims-consulting firm with software attached: an unsellable multiple, an adversarial relationship with the GC ecosystem that our customers have to keep working in, and possibly proximity to the line on providing legal services.

**What would reverse it.** Counsel advising it's clean, *and* a deliberate decision to become a services business. Both, not either.

---

## 9. No individual worker metrics — ever

*August 2026*

**Decision.** The data model has no individual productivity metric. Not hidden, not permission-gated: absent. The unit of analysis is the scope item and the crew, never the person. Faces are blurred at ingest before storage, with the original discarded. Canadian data residency by default.

**Why.** Jobsite photos contain faces, which is personal information under BC's PIPA, PIPEDA federally, and Quebec's stricter Law 25. Canadian construction is heavily unionized. A product that reads to the building trades as worker surveillance is dead on arrival regardless of its legal footing — and deservedly so.

It also happens to be commercially useful. Much ICI work is public or quasi-public, and those owners' privacy and residency questions flow downhill to their subs. An all-Canadian, no-individual-metrics answer is one a US-headquartered competitor cannot give without qualification. A competitor that started with GC-facing surveillance features cannot credibly adopt this stance later.

**What would reverse it.** Nothing. If a customer asks for per-worker scoring, the answer is no, and the reason is in the contract. This is the one entry in this log with no reversal condition, and that is deliberate.

---

## 10. Validate before building

*August 2026*

**Decision.** No application code before the 90-day validation plan reports. The kill criteria are written down and honoured.

**The bets.** Everything rests on three unproven claims:

| Bet | Test | Kill criterion |
|---|---|---|
| **Technical** — a model can count installed work from an ad-hoc phone photo | 8-week spike on real jobsite photos, measured against as-built quantities | Can't hit ±15% on one trade with human-corrected capture |
| **Behavioural** — the foreman will take the photo | Design-partner phase measures crew-day capture directly | Under 50% after 8 weeks with an engaged partner |
| **Social** — a unionized workforce accepts it | Conversation with a BC Building Trades representative, before selling | Not a numeric threshold; a judgment call to make early rather than late |

**Why.** All three are cheap to test and expensive to assume. The most valuable artifact of the first quarter is not a prototype — it's three firms' real photo sets with matching labour cost reports and bid takeoffs, under NDA. That single dataset settles the technical bet.

A fourth item is not a risk but a constraint: the market size in §6 caps the outcome, and everyone financing this should know it before they wire.

**What would reverse it.** Nothing. Building first is how a plausible thesis becomes an expensive one.

---

## 11. Adjudication is the wedge — and the single point of failure

*August 2026*

**Decision.** Lead with the evidence package and the adjudication export, shaped against Ontario practice and the final BC regulations.

**Why.** It converts documentation from record-keeping into a deadline-driven need, and it is a "why now" no US market offers. Ontario and Alberta have been living under these regimes for years, so their practice is a free specification for the BC product — the pain is predictable because it already happened elsewhere.

**The honest counterweight.** This is simultaneously the sharpest reason to buy and the sharpest way the plan fails. If BC uptake disappoints — subs use the regime rarely, or the regulations make it less accessible than expected — the evidence package reverts to an ordinary change-order tool with non-urgent value. Survivable, because the productivity half stands alone and the national thesis survives a weak BC rollout. But it costs the wedge.

**What would reverse it.** Two lawyer conversations in the first 60 days, one BC and one Ontario: what does a submission actually contain, how often do subs really use the regime, and what would make our export useful rather than decorative. Cheap, and it happens before anything is built on the assumption.
