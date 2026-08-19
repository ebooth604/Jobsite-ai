# Sitewire — Jobsite AI for Canadian Specialty Subcontractors

**Working title. Initial business plan, v0.3 — August 2026.**
**Based in Vancouver, British Columbia. Canadian market only.** All figures CAD.
Status: pre-seed / pre-incorporation. This document is a decision-making artifact, not a pitch deck. Everything below is an assumption until the validation plan in §14 marks it otherwise.

---

## 1. Executive summary

**What we're building.** A jobsite AI that turns the photos, videos, and voice notes field crews already capture into *installed-quantity production tracking* — how much work went in the ground today, against what was bid, against what the schedule assumed — plus the contemporaneous evidence package needed to get paid for the work that wasn't in the contract.

**Who we sell to.** Canadian self-performing specialty trade subcontractors — electrical, mechanical, concrete forming — doing $10M–$150M in annual revenue. Not general contractors. Not owners. Not, for now, anyone outside Canada.

**Why that wedge.** Every well-funded jobsite AI company sells to GCs and owners: OpenSpace, Buildots, DroneDeploy, Disperse, Doxel, Trunk Tools. They sell *visibility into the sub's work* to the party that manages the sub. Nobody of consequence sells production intelligence to the sub itself — the party that carries the labour risk, eats the rework, and loses the change-order argument for lack of evidence.

**Why Canada, specifically, right now.** Canada has spent seven years building something no other country has at this scale: a **province-by-province statutory adjudication regime for construction payment disputes**. Ontario since 2019, Saskatchewan and Alberta since 2022, Manitoba, the federal regime for federal works — and now BC, whose [Construction Prompt Payment Act](https://www.bclaws.gov.bc.ca/civix/document/id/bills/billsprevious/1st43rd:gov20-1) received Royal Assent in November 2025 with regulations in consultation through 2026. Ontario went further on January 1, 2026, becoming the first province to require **annual release of the 10% statutory holdback**.

Adjudication resolves payment disputes in weeks instead of years. It pays whoever walks in with dated, contemporaneous documentation and punishes the firm reconstructing its case from memory. **Canada has built a national market for exactly the artifact our product produces — and most subcontractors still keep that evidence in a text thread.** This is not a tailwind we're borrowing from a US thesis. It is the most adjudication-dense construction market in the world, and it is our home market.

**The money question.** A $40M electrical sub running 5–8% net margin loses more to unrecovered change orders and labour-productivity drift on one bad job than our software costs for three years. We price against recovered dollars, not against seats.

**The market is real without leaving the country.** Statistics from ISED's business register put ~3,200 Canadian specialty trade contractors in our ICP band — roughly a **$256M SAM** (§9). That is not a US-scale market, and it changes the shape of the company: fewer logos, deeper accounts, expansion revenue as the primary growth engine rather than new-logo velocity.

**The ask (indicative).** ~$3.0M pre-seed to reach 14 paying subcontractors and $750K ARR in the Lower Mainland. 18 months of planned burn; closer to 22 months of runway once SR&ED refunds cycle. Vancouver → Alberta → Ontario.

---

## 2. The problem, stated precisely

A specialty subcontractor bids a job as a quantity takeoff times a labour productivity rate: *N* linear feet of conduit at *X* hours per hundred feet. Everything after the bid is a race between what was assumed and what actually happens in the field.

Today the sub finds out how that race is going through:

- **Foreman daily reports** — free text, filed late, optimistic, and describing activity ("continued rough-in, 2nd floor east") rather than quantity.
- **Weekly labour cost reports from accounting** — accurate, but they report hours burned, not work installed. Hours are only half the ratio. By the time the percent-complete correction lands, you're three weeks into a losing job.
- **Project manager instinct** — real skill, but it doesn't scale past the number of jobs one PM can physically walk.

Three costs fall out of that gap:

1. **Late detection of labour drift.** A job that's going to lose 400 hours announces itself in week 3 and is discovered in week 8. The recoverable window closes first.
2. **Unrecovered change orders and delay claims.** The sub does out-of-scope work under schedule pressure, documents it in a text thread, and loses the argument months later because the GC's version of site conditions is better-evidenced. Industry rework runs roughly 5% of project cost direct, ~9–12% loaded with schedule and supervision drag — much of it caused by others and never billed back.
3. **Rework the sub eats.** Installed wrong, discovered late, no photographic record establishing who signed off on the condition.

**The one-line problem:** subs measure hours precisely and installed quantity not at all, and they can't prove site conditions when the money argument starts.

---

## 3. Why Canada is the right market to build this in

### 3.1 The adjudication map

| Jurisdiction | Prompt payment + adjudication | What it means for us |
|---|---|---|
| **Ontario** | In force since Oct 2019; amended Jan 1, 2026 (Bill 216 / Bill 60) to require **annual holdback release** | The mature market. Years of adjudication practice and a fresh 2026 cash-flow change. Biggest prize, phase 3. |
| **Alberta** | In force since Aug 2022; Public Works Act amended April 2025 | Second market. Adjudication is routine, and industrial/energy work has heavy change-order density. |
| **Saskatchewan** | In force since March 2022 | Small but live. |
| **Manitoba** | Regime in place | Small but live. |
| **Federal** | Prompt Payment for Construction Work Act in force; ON, SK, AB designated exempt as comparable | Applies to federal works nationwide — relevant to any sub on federal projects. |
| **British Columbia** | Royal Assent Nov 27, 2025; regulations in consultation June 2026, in force expected 2026 | **Our beachhead, and the newest entrant.** Every BC sub is about to face a documentation regime their Ontario counterparts learned the hard way. |
| **Quebec** | Pilot since 2018, no general regime yet | Deferred. See §11. |

### 3.2 Why this is a genuine advantage and not just context

Three consequences worth being explicit about, because they shape the plan:

1. **The pain is predictable, because it already happened.** We don't have to speculate about what BC subs will need under adjudication — Ontario and Alberta have been living it for years. Ontario adjudication practice is a free specification for our BC product.
2. **BC is the best *beachhead* and Ontario is the best *market*.** BC's regime is new, so attention is high and behaviour is unformed — the moment when a sub is most willing to change how it documents. Ontario has four times the ICP firms and a settled regime. Land where the urgency is; expand to where the volume is.
3. **This is a durable national need, not a launch window.** Adjudication isn't going away in any province that adopted it. A company built around getting subs paid under these regimes has a decade of relevance, not a two-year news cycle.

### 3.3 The honest counterweight

Adjudication is our sharpest "why now" and our sharpest single point of failure. If BC's uptake is slow — if subs use the regime rarely, or if the regulations make it less accessible than expected — the evidence package reverts to being a change-order tool with ordinary, non-urgent value. That's survivable, not fatal: the productivity half of the product stands on its own. But it would cost us the wedge, and we should know it early rather than defend it late. §14 puts a lawyer conversation in the first 60 days for exactly this reason.

---

## 4. Product

### 4.1 The core loop

1. **Capture.** Crews shoot photos and 30-second walk videos on the phone they already have, or we ingest the photo stream already flowing into Procore / Autodesk Build / a shared drive. No new hardware, no 360° rig, no drone, no BIM model required. A deliberate constraint — see §7.
2. **Extract.** Vision models estimate installed quantities against the bid's scope items ("~180 LF of ¾" EMT, level 2 grid east"), locate them by area, and flag conditions worth remembering: unfinished predecessor work, blocked access, stacked trades, damage.
3. **Reconcile.** Installed quantity joins that day's labour hours from the timekeeping system and the bid's budgeted units-per-hour. Output: **a productivity factor per scope item, per crew, per day.**
4. **Alert.** "Level 2 branch conduit has run at 0.71 of bid productivity for six working days. At this rate the scope finishes 320 hours over budget. Top correlated condition: ceiling grid installed ahead of rough-in in 4 of 6 areas."
5. **Document.** When a condition is billable — out-of-sequence work, stacked trades, access denial, differing conditions — the system assembles a dated, geolocated, photo-backed package in the shape a change order, a notice of non-payment response, or an **adjudication submission** actually needs.

Step 5 is what gets us renewed. Steps 3–4 are what make us hard to replace.

### 4.2 v1 scope (first 9 months)

| In | Out (deliberately, for now) |
|---|---|
| Photo/video ingest via mobile app + Procore/Autodesk photo sync | 360° reality capture rigs, drones, laser scanning |
| Quantity estimation for **two trades only** (electrical rough-in, concrete forming/placement) | Every trade |
| Timekeeping integration (Procore, Jonas, Vista, Rhumbix) | Full ERP write-back |
| Auto-drafted daily reports from captured media | Scheduling / P6 integration |
| Productivity-vs-bid dashboard for PM and ops | Owner/GC-facing portal |
| Evidence packages: change order + a BC adjudication export, shaped against Ontario practice | Automated filing to ODACC or a BC nominating authority |
| Face blurring at ingest; Canadian data residency | Any individual worker performance metric — ever |
| Weekly ops digest by email | Predictive schedule simulation |
| English only | French / Quebec localization (§11) |

Two trades, not ten. The quantity models are trade-specific, and credibility with a $40M electrical contractor requires being *right*, not broad. Concrete forming is the right second trade in this market: Metro Vancouver's high-rise pipeline has a dense cluster of forming subs, and formwork is the most visually tractable scope to measure.

### 4.3 Worker privacy is a product decision, not a legal afterthought

Jobsite photos contain workers' faces. In BC that is personal information under [PIPA](https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01); federally and in most other provinces, PIPEDA; in Quebec, Law 25, which is stricter than both. Canadian construction is also heavily unionized. A product that reads to the building trades as worker surveillance is dead on arrival regardless of its legal footing — and deservedly so.

Our commitments, in the product and in the contract:

- **We measure installed work, not workers.** No individual productivity metric exists in the data model. Not hidden, not gated — absent. The unit of analysis is the scope item and the crew, never the person.
- **Faces are blurred at ingest**, before the image is stored, with the original discarded.
- **Canadian data residency**, on Canadian cloud regions, full stop.
- **A plain-language worker notice** the customer can post on site.

In a Canada-only business this stops being a compliance cost and becomes a commercial asset. A large share of ICI work is public or quasi-public — health authorities, school districts, universities, BC Hydro, TransLink, Infrastructure Ontario — and those owners' privacy and residency questions flow downhill to their subs. An all-Canadian, Canadian-owned, no-individual-metrics answer is one a US-headquartered competitor cannot give without qualification.

### 4.4 What makes the output trusted

Field software dies of false positives. Three commitments in v1:

- Every number is traceable to the photos that produced it, in one click.
- The model reports a confidence band and abstains rather than guessing — an abstention is a "needs 30 seconds of foreman input" nudge, not a silent bad number.
- The foreman can correct any quantity in one tap, and corrections are the training signal. Corrections-per-week is our core quality metric and should fall month over month per customer.

---

## 5. Customer

### 5.1 ICP

- **Firm:** Canadian self-performing specialty trade subcontractor, $10M–$150M revenue, roughly 50–400 employees, 8–40 concurrent projects, primarily ICI and high-rise residential.
- **Beachhead:** Metro Vancouver and the Fraser Valley — the Lower Mainland carries roughly 60% of BC's construction employment.
- **Economic buyer:** VP of Operations or President. In firms this size that person still knows every job by name and personally feels a losing one.
- **Champion:** Chief Estimator or Director of Project Management — owns the bid productivity rates our system measures against, and has wanted this feedback loop their entire career.
- **User:** Foreman (30 seconds/day capture) and PM (5 minutes/day reading).
- **Disqualifiers:** brokers who don't self-perform; residential production builders; firms under ~$8M (no PM layer, can't pay); firms whose GC mandates a competing platform *and* whose contracts strip change-order rights.

### 5.2 Why they buy

Ranked by what actually closes deals:

1. "You found $180K of billable out-of-scope work on one job that we would have eaten." Pays for itself, undeniably.
2. "You told us job 24-118 was going sideways in week 3." The ops leader's recurring nightmare.
3. "When the adjudication notice landed, our package took an afternoon instead of three weeks."
4. "Our foremen stopped writing daily reports and the reports got better." Adoption lubricant, not a purchase reason.

### 5.3 Why they don't buy

| Objection | Answer |
|---|---|
| "My foremen won't use it." | 30 seconds, on the phone they already hold, and the daily report writes itself. If pilot capture falls below 70% of crew-days, we failed and we say so. |
| "We already have Procore." | Procore stores your photos. It doesn't count what's in them or tell you your productivity factor. We ride on top of it. |
| "Our GC will use this against us." | The data is yours. There is no GC-facing product, by design. |
| "The union will call this surveillance." | No individual metrics exist in the system, faces are blurred at ingest, and here is the worker notice you can post on site. See §4.3. |
| "Where does our data live?" | Canada. Canadian company, Canadian regions, and we'll put it in the contract. |
| "AI can't count my conduit." | Correct, in general. It can in the two trades we've trained on — here's the accuracy report from the last four pilots. |

---

## 6. What Canada-only does to the shape of the company

This is the most important structural consequence of the constraint, and it deserves its own section rather than a footnote.

A ~3,200-firm national ICP means **we cannot grow on new-logo velocity.** At any believable win rate, logo count runs out. The company has to grow the other way:

- **Expansion revenue is the primary engine, not a bonus.** Net revenue retention above 120% isn't a nice metric here; it's the growth model. That pulls multi-trade support and per-project expansion *earlier* in the roadmap than a US-market plan would.
- **Churn is disproportionately expensive.** In a market this size, every lost account is also a lost reference in a community where everyone knows everyone. Retention spend beats acquisition spend earlier than usual.
- **Depth per account beats breadth of product.** Better to be indispensable to an electrical contractor across all 30 of its jobs than adequate to six trades on one job each.
- **A smaller sales team, hired later.** Founder-led selling can plausibly cover the Lower Mainland and much of Alberta. The first AEs are for Ontario, not for BC.
- **The exit story is Canadian-shaped.** At $36M ARR against a $256M SAM we're a strategic acquisition (Procore, Autodesk, Trimble, a Canadian construction-software consolidator), not an IPO candidate. That's a legitimate outcome and it should be said out loud to investors rather than discovered by them.

If the constraint later relaxes, the same product sells into Washington and the rest of the US against a market roughly six times larger — but nothing in this plan depends on that, and no milestone assumes it.

---

## 7. Competition and why we're not roadkill

| Player | Sells to | Capture | Their answer to a sub | Our angle |
|---|---|---|---|---|
| **OpenSpace** | GC / owner | 360° rig | Reality capture + visual record | No rig needed; we join to *their* labour hours and bid units |
| **Buildots** | GC / owner | Helmet cam | Progress vs. BIM schedule | Requires BIM + full schedule; subs have neither at their level |
| **Procore / Autodesk** | GC (+ subs) | Photo storage | System of record + AI features | Platforms, not measurement; we integrate rather than compete |
| **Doxel / Disperse / Avvir** | Owner / GC | Scans, BIM | Capital-project progress verification | Enterprise motion, months-long deploy; wrong shape for a $40M sub |
| **Trunk Tools** | GC | Documents | Agents over project documents | Adjacent, not overlapping; plausible partner or acquirer |
| **Bridgit, SiteMax, Jonas, Sage** (Canadian/incumbent) | Sub / GC | Forms, workforce, ERP | Workflow and records, no measurement | Integration targets; SiteMax in particular is BC-native and worth a partnership conversation |
| **Claims consultants and construction lawyers** | Sub, after the fact | Human | Reconstruct the record, bill hourly | We're the contemporaneous version at a fraction of the cost — a referral partner, not a rival |

**The honest read.** The reality-capture category is well capitalized and largely won at the GC/owner tier — [Buildots raised a $45M Series D, Trunk Tools $30.5M, Fyld $41M](https://news.fundsforngos.org/2026/05/21/construction-tech-funding-rounds-may-2026-ai-and-automation-startups-attract-fresh-capital/). We are not attacking it. We're arguing the sub is a *separate market*: separate buyer, separate data (labour hours and bid units, which the GC never sees), separate value event.

**A Canada-only strategy also buys a real defensive benefit:** we are too small a prize, in too specific a regulatory context, to be worth a US incumbent's dedicated attention for several years. That's not a moat, but it is time — and time is what the data moat needs.

**Defensibility, ranked by how much we actually believe it:**

1. **Data.** Installed quantity ↔ labour hours ↔ bid rate, by trade, across firms. Nobody else has both sides of that ratio, because nobody else sells to the party that owns both. Compounds, genuinely hard to copy.
2. **Regulatory fit.** Evidence packages shaped to Canadian adjudication practice, province by province. Localization that a global product treats as an edge case is our core.
3. **Workflow lock.** Once change orders are documented in our format and estimators tune bid rates against our productivity history, we're inside the annual planning cycle.
4. **Trust in the trade.** Canadian subcontracting is a small, referral-driven world. Compounds fast — and works against us in each new province, where we start unknown.
5. **The privacy and residency stance.** Hard for a GC-facing or US-headquartered competitor to match without qualification.
6. **Model quality.** Real, but a depreciating asset. We should not tell ourselves this is the moat.

**Where we lose:** if Procore or Autodesk ships adequate quantity extraction as a bundled feature before we own the ratio dataset.

---

## 8. The Vancouver base and the Canadian capital stack

**What it buys us**

- **Cash-efficient R&D.** As a CCPC we can claim the federal SR&ED refundable ITC at 35% — recently enhanced to a **$6M expenditure limit** — plus **BC's 10% refundable** provincial credit. On eligible engineering salaries with the prescribed proxy, a large fraction of our biggest cost line returns as cash, not a deduction. *(Confirm with a SR&ED specialist before relying on the modelled figure.)*
- **The rest of the non-dilutive stack.** NRC IRAP for the technical build. Mitacs Accelerate for UBC/SFU graduate ML interns at a fraction of loaded cost — unusually well-matched to a computer-vision problem with a real industrial partner.
- **Angel economics that favour exactly our best investors.** BC's Investment Capital Program lets eligible BC investors claim a **30% refundable tax credit** on investments in registered Eligible Business Corporations. Our ideal angels are Lower Mainland contractors who understand the problem viscerally — and this makes their cheque materially cheaper. Registering as an EBC early is a concrete, cheap action item.
- **Talent.** Deep computer-vision bench from UBC/SFU and the local VFX and games industry, well below Bay Area cost, with lower attrition risk.
- **A walkable beachhead.** A founder can stand in four jobsite trailers in a day. The design-partner phase depends on exactly that.

**What it costs us**

- **Thinner pre-seed capital.** Canada's early-stage market is smaller and more syndicate-driven. Plan for a mix of construction-industry angels (see above), BDC Capital, and Canadian pre-seed funds — a longer raise than a comparable US company would run.
- **No currency arbitrage.** CAD cost base against CAD revenue. The margin uplift a cross-border plan would have had is gone, which makes the SR&ED recovery and the pricing discipline in §10 matter more, not less.
- **Distance from the category's centre of gravity.** The reference customers, conferences, and acquirers in construction tech are largely US. We'll be less visible, and should assume outbound investor and partner effort rather than inbound.

---

## 9. Market sizing (bottom-up, from the business register)

Grounded in [ISED's Canadian Industry Statistics for NAICS 238 (specialty trade contractors)](https://ised-isde.canada.ca/app/ixb/cis/businesses-entreprises/238), 2025 reference data — not an estimate.

Canada has 62,023 micro (1–4 employees), 38,279 small (5–99), 929 medium (100–499), and 50 large (500+) specialty trade contractor businesses. Our ICP — $10–150M revenue, self-performing, with a real PM layer — maps to essentially all of the medium and large bands plus the upper slice of the small band (roughly 50–99 employees).

| Region | Medium + large (238) | + upper slice of small (est.) | **ICP firms (est.)** | **At $80K ACV** |
|---|---|---|---|---|
| **Metro Vancouver + Fraser Valley** | ~80 | ~240 | **~320** | **~$26M** |
| **British Columbia** | 137 | ~400 | **~540** | **~$43M** |
| **Alberta** | 195 | ~305 | **~500** | **~$40M** |
| **Ontario** | 339 | ~760 | **~1,100** | **~$88M** |
| **Quebec** (deferred) | 214 | ~500 | **~715** | **~$57M** |
| **Rest of Canada** | 94 | ~150 | **~245** | **~$20M** |
| **Canada total (SAM)** | **979** | **~2,250** | **~3,200** | **~$256M** |

**SOM (year 5):** ~400 firms across BC, Alberta and Ontario, three trades, at ~$90K blended ACV = **~$36M ARR** — roughly 12% of the national ICP base. Aggressive but arguable in a referral market.

**ACV build (a $40M electrical sub):** 18 concurrent projects × $475/project/month = $102K/yr. Land smaller — a 4-project pilot is $22.8K/yr — and expand on renewal. Blended across the ICP band: **$80K**.

**Two honest notes on this table.** The medium/large counts are real; the "upper slice of small" column is my estimate of how many 5–99-employee firms clear $10M in revenue, and it carries most of the uncertainty. And this supersedes the cruder figures in v0.1–v0.2 — the earlier BC number was materially too low. §14 replaces the estimated column with a StatCan revenue-band pull.

---

## 10. Pricing

**Per active project, per month. Not per seat.** Seat pricing punishes the customer for putting more crew on capture — exactly the behaviour our data quality depends on. Project pricing scales with delivered value and matches how a sub already thinks about cost coding.

| Tier | Price | Includes |
|---|---|---|
| **Pilot** | $16K flat, 90 days, up to 4 projects | Full product, accuracy report, exit review — refundable against year 1 |
| **Core** | $475 / active project / month | Production tracking, daily reports, alerts, 1 trade model |
| **Plus** | $700 / active project / month | + evidence packages (change order and adjudication), multi-trade, bid-rate feedback to estimating, API |

Annual, paid upfront where possible — this ICP tolerates it and it fixes our working capital.

**Pricing discipline matters more in a small market.** With no currency uplift and a capped logo count, ACV growth per account is the growth model (§6). Build the expansion path into the first contract: pricing that makes adding the fifth, tenth, and twentieth project obviously worth it, and a Plus tier the customer grows into rather than negotiates for.

**Explicitly not doing:** contingency or success-fee pricing on recovered change orders and adjudication awards. It's the pricing the value story begs for, and it turns us into a claims-consulting firm with software attached — unsellable multiple, adversarial relationship with the GC ecosystem, and possibly near the line on providing legal services. Revisit only with counsel.

---

## 11. Go to market

**Motion: founder-led, trade-vertical, metro-dense, referral-compounding.** Not PLG. Not inside sales at this stage.

| Phase | Window | Where |
|---|---|---|
| **1 — Design partners** | Months 0–6 | Six Metro Vancouver subs, two trades. Free-to-cheap for capture access, labour data, and brutal weekly feedback. Success = 70%+ crew-day capture and one documented dollar recovery per partner. |
| **2 — Paid pilots** | Months 6–12 | Convert design partners; add 10–12 paid pilots in the Lower Mainland. Every pilot ends in a written accuracy-and-value review — the sales asset for the next ten. |
| **3 — Alberta** | Months 12–24 | Calgary and Edmonton. Adjudication live since 2022, heavy industrial change-order density, and a market that buys on demonstrated ROI. Still founder-led. |
| **4 — Ontario** | Months 24–42 | The GTA is the largest ICP concentration in the country and the most mature adjudication market. First real AE hires. Assume 18 months of relationship-building before it compounds. |
| **Deferred — Quebec** | Not before year 4 | ~715 ICP firms is genuinely attractive, but it needs French-language product and support under the Charter of the French Language, Law 25 privacy compliance, and a distinct construction-law culture — and Quebec still has no general adjudication regime. Revisit as a deliberate project, not an extension. |

**Channels, in the order we'd actually work them:**

- **VRCA** (Vancouver Regional Construction Association) — the single highest-leverage room in the beachhead. Later: CCA nationally, Calgary Construction Association, Ontario General Contractors Association and the trade councils.
- **Trade associations by discipline:** ECABC (electrical), MCABC (mechanical), BCCA provincially, ICBA on the open-shop side.
- **The adjudication moment.** Every association, law firm, and surety in BC is running prompt-payment education through the regulation rollout. Being genuinely useful in those rooms — a good explainer on what documentation an adjudication actually requires, informed by Ontario practice — is the cheapest qualified-lead source we will ever have. Education, not a pitch.
- **Construction lawyers and claims consultants.** They see the evidence gap first and are not competitors; they're the ones who tell a sub "you'd have won this if you'd photographed it." In Ontario, this channel is more developed than the software channel.
- **Surety brokers and construction-specialist accountants**, structurally interested in their clients not losing money on jobs.
- **Canadian software incumbents** (SiteMax, Jonas, Bridgit) as integration and referral partners — test, don't build on.

---

## 12. Financial plan (indicative)

**Raise:** ~$3.0M pre-seed. 18 months of planned burn; ~22 months of effective runway once SR&ED refunds cycle.

| Use of funds | Share | Notes |
|---|---|---|
| Engineering (4 FTE incl. 2 ML) | 55% | Vision/quantity models, mobile capture, integrations — substantially SR&ED-eligible; Mitacs interns extend it |
| Field/customer (1 construction-native FTE) | 15% | Ex-PM or ex-estimator from a BC sub; owns pilots and truth |
| Founders | 15% | Below market |
| Compute + data labelling | 8% | Trade-specific annotation is a real line item |
| G&A, legal, insurance | 7% | Construction E&O and a privacy review both matter here |

**Non-dilutive offset.** Engineering dominates the burn and most of it is SR&ED-eligible, so a substantial share of qualifying salary returns as cash on a 12–18 month lag, with IRAP on top for a defined technical project. **Model it conservatively and treat the refund as runway extension, never as revenue** — claiming productization work as research is the classic way a startup's claim gets reduced. Register as an EBC before the angel round so BC investors can claim the 30% credit.

**Revenue trajectory (base case):**

| | M6 | M12 | M18 | M24 | M36 |
|---|---|---|---|---|---|
| Paying customers | 0 | 6 | 14 | 28 | 70 |
| ARR | $0 | $220K | $750K | $1.9M | $5.5M |
| Gross margin | — | ~55% | ~68% | ~75% | ~78% |

M24 onward assumes Alberta is contributing and expansion within existing accounts is carrying more of the growth than new logos — consistent with §6.

Early gross margin is deliberately poor: inference cost per project-day plus human-in-the-loop QA on quantity extraction. **The margin curve is the technical milestone.** If QA cost per project doesn't halve between M12 and M24, the model isn't learning and we're a services firm.

**Metrics that decide the seed round:** net revenue retention >120% (the growth model, not a vanity metric); crew-day capture >70%; quantity accuracy within ±10% on trained scope items; corrections-per-project-week trending down; documented customer dollar recovery per account.

---

## 13. Roadmap

| Quarter | Milestone |
|---|---|
| **Q1** | Electrical rough-in quantity model at ±15%; mobile capture with face blurring at ingest; Canadian-region infrastructure; Procore photo sync; 3 design partners live |
| **Q2** | Labour-hours join (Procore/Jonas/Rhumbix); productivity dashboard; auto daily reports; 6 design partners; ±10% accuracy |
| **Q3** | Evidence packages incl. adjudication export, shaped with counsel against Ontario practice and the final BC regulations; concrete forming model; first 3 paid conversions |
| **Q4** | Alerting engine tuned on real drift events; bid-rate feedback to estimating; 6 paying customers, $220K ARR |
| **Y2 H1** | Third trade; multi-trade expansion inside existing accounts (the §6 growth engine); $750K ARR |
| **Y2 H2** | Calgary beachhead; Alberta adjudication export; seed raise |
| **Y3** | Edmonton; Ontario groundwork and first AE hires |

---

## 14. Team

**Needed at founding:**
- **Technical founder/CTO** — applied CV/multimodal ML, comfortable that the ground truth is muddy and the users wear gloves.
- **Commercial founder/CEO** — must be able to sit in a trailer in Surrey and be believed. Construction-native beats SaaS-native here, and BC-construction-native beats both.
- **Hire #1: Director of Field Success** — a real ex-PM or ex-chief-estimator from a Lower Mainland sub. Not a customer success hire; this person is the arbiter of whether our numbers are right, and no ML team should be without one.

**Advisors to recruit:** a VP Ops at a $50M+ BC specialty sub; a construction lawyer active in adjudication — ideally one practising in both Ontario and BC; an estimator who owns bid productivity rates; privacy counsel for the PIPA/PIPEDA position.

---

## 15. Risks, and what kills this

| Risk | Severity | Mitigation / kill criterion |
|---|---|---|
| **Quantity extraction isn't accurate enough from ad-hoc photos** | Existential | 8-week technical spike on real jobsite photos before any raise. **Kill if** we can't hit ±15% on one trade with human-corrected capture. |
| **Foremen don't capture** | Existential | Measured directly in the design-partner phase. **Kill/pivot if** crew-day capture stays under 50% after 8 weeks with an engaged partner. |
| **The Canadian market is too small to reach venture-scale returns** | High, structural | Acknowledged in §6 and stated to investors upfront: this is a $36M-ARR strategic-acquisition shape, not an IPO shape. Raise from investors who want that outcome, not ones who tolerate it. |
| **Union or worker-privacy backlash frames us as surveillance** | High | The §4.3 stance is non-negotiable and built in from v1; validate with a BC Building Trades contact during discovery, not in a sales cycle |
| **BC adjudication uptake disappoints** | High | The productivity half stands alone; Ontario and Alberta already have live regimes, so the national thesis survives a weak BC rollout. Lawyer conversation in the first 60 days. |
| **Procore or Autodesk bundles it** | High | Depth in two trades, own the hours↔quantity dataset, be acquirable |
| **Labour-hours data dirtier than assumed** (cost coding varies firm to firm) | High | Validate on real exports from 3 BC firms in month 1; may require a normalization layer we haven't scoped |
| **Growth stalls because expansion revenue underperforms** | High (Canada-specific) | NRR is the growth model, so it's the metric we manage weekly from the first paying customer, not a year-two concern |
| **SR&ED claim reduced** (productization treated as non-eligible) | Medium | Specialist review pre-raise; contemporaneous technical documentation from day one; never model the refund as revenue |
| **BC residential slowdown erodes the concrete-forming beachhead** | Medium | ICI weighting; test trade choice against BuildForce demand curves in discovery |
| **Thin Canadian pre-seed market lengthens the raise** | Medium | Start with construction-industry angels using the EBC credit; treat institutional money as a follow-on, not the anchor |
| **Our data used against the customer** in adjudication or dispute | Medium | Counsel early; explicit ownership and retention terms; this is a trust market |

**The honest summary of risk:** one technical bet (can we count installed work from a foreman's phone?), one behavioural bet (will he take the photo?), one social bet (will a unionized workforce accept it?), and one structural constraint (a $256M SAM caps the outcome, and everyone financing this should know that before they wire). The first three are cheap to test and §16 tests them. The fourth isn't a risk to be mitigated — it's a decision to be made honestly.

---

## 16. Next 90 days — validation before building

**Days 1–30 — Is the problem worth money here?**
- 25 discovery calls with VPs of Ops at Metro Vancouver ICP subs, sourced through VRCA, ECABC, and MCABC. Structured, same questions, written up. Target output: hours per year lost to late-detected drift, and change orders abandoned for lack of evidence in the last 12 months.
- Obtain real jobsite photo sets + matching labour cost reports + bid takeoffs from 3 BC firms under NDA. **The single most valuable artifact of the quarter.**
- Replace the estimated column in §9 with a StatCan revenue-band pull for NAICS 238.
- One conversation with a BC Building Trades representative about the §4.3 stance, before we're selling anything.

**Days 31–60 — Can the model do it, and does adjudication actually bite?**
- Technical spike: quantity estimation on the real photo sets, one trade, measured against as-built quantities. Report accuracy honestly, including abstention rate.
- Prototype the hours↔quantity join on one firm's actual cost codes and find out how dirty the data really is.
- Two lawyer conversations — one BC, one Ontario. What does an adjudication submission actually contain, how often do subs really use the regime, and what would make our export useful rather than decorative? **This is the test of §3, and it is cheap.**

**Days 61–90 — Will anyone pay?**
- Three signed design-partner LOIs, including data access terms.
- One paid pilot commitment at $16K contingent on the accuracy threshold.
- SR&ED eligibility opinion; EBC registration; a corporate structure that preserves CCPC status.
- Go/no-go against the kill criteria in §15, written down and honoured.

---

## 17. Open questions

1. **Trade choice.** Electrical + concrete forming is a guess tuned to this market. Electrical has the best quantity structure and the worst rough-in visibility; forming is the most visually tractable but exposed to the residential curve. Mechanical piping may beat both in BC's institutional pipeline. Decide with discovery data, not preference.
2. **Alberta or Ontario second?** Alberta is closer, easier, and has live adjudication; Ontario has four times the firms and the mature market. The plan says Alberta first on cost-of-entry grounds — but if Ontario discovery shows the adjudication channel is already selling itself there, that ordering should flip.
3. **How hard do we lean on adjudication?** It's the sharpest "why now" and the sharpest single point of failure. §16 tests it directly in the first 60 days.
4. **Do we need the bid takeoff?** The ratio needs budgeted units. If subs won't share takeoffs early, we need a cold-start path — crew-relative trending instead of bid-relative.
5. **What's the honest ceiling, and who should fund it?** A $256M SAM supports a strong, durable, profitable Canadian software business and a strategic exit. It does not support a fund-returning outcome for a large VC. Pick investors accordingly — construction-industry angels, BDC, and Canadian pre-seed funds are a better fit than anyone underwriting a $1B outcome.
6. **Where does safety fit?** Easiest to detect, hardest to charge a sub for, and it collides directly with our privacy stance. Probably never the wedge.

---

## Companion document

The engineering translation of §4 and §13 — system architecture, data model, ML pipeline, privacy/residency implementation checklist, and a quarter-by-quarter engineering breakdown — lives in [technical-implementation-plan.md](technical-implementation-plan.md). It mirrors §17's open questions as engineering decisions rather than resolving them.

---

## Sources

- [Canadian Industry Statistics — Specialty trade contractors (NAICS 238), business counts by size and province — ISED](https://ised-isde.canada.ca/app/ixb/cis/businesses-entreprises/238)
- [Prompt Payment, Liens and Adjudication: status of legislation in Canada — Miller Thomson](https://www.millerthomson.com/en/insights/construction-and-infrastructure-law/prompt-payment-liens-and-adjudication-reviewing-the-status-of-legislation-in-canada/)
- [Canada's Prompt Payment Legislation — a national perspective — BLG](https://www.blg.com/en/insights/perspectives/canadas-prompt-payment-legislation)
- [Canadian prompt payment and construction law reforms — Osler](https://www.osler.com/en/insights/updates/canadian-prompt-payment-and-construction-law-reforms/)
- [Updates to prompt payment legislation in Ontario, British Columbia and Alberta — Bennett Jones](https://www.bennettjones.com/Insights/Blogs/Updates-to-Prompt-Payment-Legislation)
- [Bill 20 – 2025: Construction Prompt Payment Act — BC Laws](https://www.bclaws.gov.bc.ca/civix/document/id/bills/billsprevious/1st43rd:gov20-1)
- [Prompt payment legislation — Province of British Columbia](https://www2.gov.bc.ca/gov/content/governments/infrastructure/prompt-payment-legislation)
- [SR&ED program enhancements, Bill C-15 — BDO Canada](https://www.bdo.ca/insights/sr-ed-program-enhancements-and-updates-draft-legislation-released)
- [British Columbia SR&ED tax credit guide](https://govmoney.ca/blog/bc-rd-tax-credit-guide)
- [BuildForce Canada — BC residential and non-residential demand outlook](https://www.buildforce.ca/en/press-release/residential-construction-demands-slow-in-british-columbia-to-2035-while-short-term-non-residential-growth-is-expected-to-be-significant/)
- [The real cost of rework in construction — OpenSpace](https://www.openspace.ai/blog/cost-of-rework-in-construction/)
- [How much does field rework in construction actually cost? — ASCE](https://www.asce.org/publications-and-news/civil-engineering-source/article/2026/01/22/how-much-does-field-rework-in-construction-actually-cost)
- [Construction tech funding rounds, 2026 — fundsforNGOs](https://news.fundsforngos.org/2026/05/21/construction-tech-funding-rounds-may-2026-ai-and-automation-startups-attract-fresh-capital/)
