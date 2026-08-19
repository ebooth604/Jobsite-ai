# Sitewire — Jobsite AI for Specialty Subcontractors

**Working title. Initial business plan, v0.2 — August 2026.**
**Based in Vancouver, British Columbia.** All figures CAD unless marked USD.
Status: pre-seed / pre-incorporation. This document is a decision-making artifact, not a pitch deck. Everything below is an assumption until the validation plan in §13 marks it otherwise.

---

## 1. Executive summary

**What we're building.** A jobsite AI that turns the photos, videos, and voice notes field crews already capture into *installed-quantity production tracking* — how much work went in the ground today, against what was bid, against what the schedule assumed — plus the contemporaneous evidence package needed to get paid for the work that wasn't in the contract.

**Who we sell to.** Mid-market specialty trade subcontractors — electrical, mechanical, concrete forming — doing $10M–$150M in annual revenue. Not general contractors. Not owners.

**Why that wedge.** Every well-funded jobsite AI company sells to GCs and owners: OpenSpace, Buildots, DroneDeploy, Disperse, Doxel, Trunk Tools. They sell *visibility into the sub's work* to the party that manages the sub. Nobody of consequence sells production intelligence to the sub itself — the party that carries the labour risk, eats the rework, and loses the change-order argument for lack of evidence.

**Why Vancouver, and why now.** BC just rewrote the rules on getting paid. The [Construction Prompt Payment Act (Bill 20, 2025)](https://www.bclaws.gov.bc.ca/civix/document/id/bills/billsprevious/1st43rd:gov20-1) imposes 28-day payment on proper invoices, cuts the Builders Lien Act holdback release period from 55 to 46 days, and — the part that matters to us — introduces **statutory adjudication**: fast, binding-on-an-interim-basis dispute resolution on tight clocks. Regulations went to industry consultation in June 2026. A regime that resolves payment disputes in weeks instead of years pays whoever walks in with dated, defensible, contemporaneous documentation. Subcontractors in BC are about to need exactly the artifact our product produces, on a deadline, and most of them keep that evidence in a text thread.

That is a genuine home-market advantage — the same product is worth more in BC in 2027 than it is in Texas, because the law makes the evidence actionable on a schedule.

**The money question.** A $40M electrical sub running 5–8% net margin loses more to unrecovered change orders and labour-productivity drift on one bad job than our software costs for three years. We price against recovered dollars, not against seats.

**The ask (indicative).** ~$3.0M CAD pre-seed to reach 12 paying subcontractors, $750K ARR, and a defensible dataset of labour-hours-to-installed-quantity by trade. 18 months of planned burn — closer to 22 months of real runway once SR&ED refunds land (§10). Vancouver base, Cascadia expansion.

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

**What Bill 20 does to that problem.** Adjudication compresses the argument from years to weeks. That cuts both ways for a sub: the fast lane to payment is real, but it rewards preparation and punishes the firm whose case has to be reconstructed from memory after the notice lands. The BC sub's documentation problem is about to acquire a due date.

---

## 3. Product

### 3.1 The core loop

1. **Capture.** Crews shoot photos and 30-second walk videos on the phone they already have, or we ingest the photo stream already flowing into Procore / Autodesk Build / a shared drive. No new hardware, no 360° rig, no drone, no BIM model required. This is a deliberate constraint — see §5.
2. **Extract.** Vision models estimate installed quantities against the bid's scope items ("~180 LF of ¾" EMT, level 2 grid east"), locate them by area, and flag conditions worth remembering: unfinished predecessor work, blocked access, stacked trades, damage.
3. **Reconcile.** Installed quantity joins that day's labour hours from the timekeeping system and the bid's budgeted units-per-hour. Output: **a productivity factor per scope item, per crew, per day.**
4. **Alert.** "Level 2 branch conduit has run at 0.71 of bid productivity for six working days. At this rate the scope finishes 320 hours over budget. Top correlated condition: ceiling grid installed ahead of rough-in in 4 of 6 areas."
5. **Document.** When a condition is billable — out-of-sequence work, stacked trades, access denial, differing conditions — the system assembles a dated, geolocated, photo-backed evidence package in the format the change order, notice of non-payment response, or adjudication submission needs.

Step 5 is what gets us renewed. Steps 3–4 are what make us hard to replace. In BC, step 5 acquires a statutory clock, which is why the BC build order puts it earlier than a US-first plan would.

### 3.2 v1 scope (first 9 months)

| In | Out (deliberately, for now) |
|---|---|
| Photo/video ingest via mobile app + Procore/Autodesk photo sync | 360° reality capture rigs, drones, laser scanning |
| Quantity estimation for **two trades only** (electrical rough-in, concrete forming/placement) | Every trade |
| Timekeeping integration (Procore, Jonas, Vista, Rhumbix) | Full ERP write-back |
| Auto-drafted daily reports from captured media | Scheduling / P6 integration |
| Productivity-vs-bid dashboard for PM and ops | Owner/GC-facing portal |
| Evidence packages: change order, and a BC adjudication-shaped export | Automated claim or adjudication filing |
| Face blurring at ingest; Canadian data residency | Any individual worker performance metric — ever |
| Weekly ops digest by email | Predictive schedule simulation |

Two trades, not ten. The quantity models are trade-specific, and credibility with a $40M electrical contractor requires being *right*, not broad. Concrete forming is the right second trade in this market specifically: Metro Vancouver's high-rise pipeline has a dense cluster of forming subs, and formwork is the most visually tractable scope to measure.

### 3.3 Worker privacy is a product decision, not a legal afterthought

Jobsite photos contain workers' faces, and in BC that makes them personal information under [PIPA](https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/03063_01). BC is also a heavily unionized construction market. A product that reads to the BC Building Trades as worker surveillance is dead on arrival regardless of its legal footing, and deservedly so.

Our commitments, in the product and in the contract:

- **We measure installed work, not workers.** No individual productivity metric exists in the data model. Not hidden, not gated — absent. The unit of analysis is the scope item and the crew, never the person.
- **Faces are blurred at ingest**, before the image is stored, with the original discarded.
- **Canadian data residency** by default, on Canadian cloud regions, so contractors on public-sector work (health authorities, school districts, BC Hydro, TransLink) can answer their FIPPA questions without a call to us.
- **Written worker-facing notice** that a customer can post on site, in plain language, describing exactly what is and isn't collected.

Treat this as a moat rather than a cost: a competitor that started with GC-facing surveillance features cannot credibly adopt this stance later.

### 3.4 What makes the output trusted

Field software dies of false positives. Three commitments in v1:

- Every number is traceable to the photos that produced it, in one click.
- The model reports a confidence band and abstains rather than guessing — an abstention is a "needs 30 seconds of foreman input" nudge, not a silent bad number.
- The foreman can correct any quantity in one tap, and corrections are the training signal. Corrections-per-week is our core quality metric and should fall month over month per customer.

---

## 4. Customer

### 4.1 ICP

- **Firm:** Self-performing specialty trade subcontractor, $10M–$150M revenue, 8–40 concurrent projects, primarily ICI (institutional/commercial/industrial) and high-rise residential.
- **Beachhead geography:** Metro Vancouver and the Fraser Valley — the Lower Mainland carries roughly 60% of BC's construction employment.
- **Economic buyer:** VP of Operations or President. In firms this size that person still knows every job by name and personally feels a losing one.
- **Champion:** Chief Estimator or Director of Project Management — owns the bid productivity rates our system measures against, and has wanted this feedback loop their entire career.
- **User:** Foreman (30 seconds/day capture) and PM (5 minutes/day reading).
- **Disqualifiers:** brokers who don't self-perform; residential production builders; firms under ~$8M (no PM layer, can't pay); firms whose GC mandates a competing platform *and* whose contracts strip change-order rights.

### 4.2 Why they buy

Ranked by what actually closes deals:

1. "You found $180K of billable out-of-scope work on one job that we would have eaten." Pays for itself, undeniably.
2. "You told us job 24-118 was going sideways in week 3." The ops leader's recurring nightmare.
3. "When the adjudication notice landed, our package took an afternoon instead of three weeks." A BC-specific reason that did not exist before 2026.
4. "Our foremen stopped writing daily reports and the reports got better." Adoption lubricant, not a purchase reason.

### 4.3 Why they don't buy

| Objection | Answer |
|---|---|
| "My foremen won't use it." | 30 seconds, on the phone they already hold, and the daily report writes itself. If pilot capture falls below 70% of crew-days, we failed and we say so. |
| "We already have Procore." | Procore stores your photos. It doesn't count what's in them or tell you your productivity factor. We ride on top of it. |
| "Our GC will use this against us." | The data is yours. There is no GC-facing product, by design — positioning as much as policy. |
| "The union will call this surveillance." | No individual metrics exist in the system, faces are blurred at ingest, and here is the worker notice you can post on site. See §3.3. |
| "AI can't count my conduit." | Correct, in general. It can in the two trades we've trained on — here's the accuracy report from the last four pilots. |

---

## 5. Competition and why we're not roadkill

| Player | Sells to | Capture | Their answer to a sub | Our angle |
|---|---|---|---|---|
| **OpenSpace** | GC / owner | 360° rig | Reality capture + visual record | No rig needed; we join to *their* labour hours and bid units |
| **Buildots** | GC / owner | Helmet cam | Progress vs. BIM schedule | Requires BIM + full schedule; subs have neither at their level |
| **Procore / Autodesk** | GC (+ subs) | Photo storage | System of record + AI features | Platforms, not measurement; we integrate rather than compete |
| **Doxel / Disperse / Avvir** | Owner / GC | Scans, BIM | Capital-project progress verification | Enterprise motion, months-long deploy; wrong shape for a $40M sub |
| **Trunk Tools** | GC | Documents | Agents over project documents | Adjacent, not overlapping; plausible partner or acquirer |
| **Safety-vision vendors** | Enterprise EHS | Fixed cameras | PPE and zone violation detection | Different buyer and budget; we don't lead with safety, and in BC we can't |
| **Local claims consultants / delay experts** | Sub (after the fact) | Human | Reconstruct the record, bill hourly | We're the contemporaneous version at 5% of the cost — and a referral partner, not a rival |

**The honest read.** The reality-capture category is well capitalized and largely won at the GC/owner tier — [Buildots raised a $45M Series D, Trunk Tools $30.5M, Fyld $41M](https://news.fundsforngos.org/2026/05/21/construction-tech-funding-rounds-may-2026-ai-and-automation-startups-attract-fresh-capital/). We are not attacking it. We're arguing the sub is a *separate market*: separate buyer, separate data (labour hours and bid units, which the GC never sees), separate value event.

**Defensibility, ranked by how much we actually believe it:**

1. **Data.** Installed quantity ↔ labour hours ↔ bid rate, by trade, across firms. Nobody else has both sides of that ratio, because nobody else sells to the party that owns both. Compounds, and genuinely hard to copy.
2. **Workflow lock.** Once change orders are documented in our format and estimators tune bid rates against our productivity history, we're inside the annual planning cycle.
3. **Trust in the trade.** Subcontracting is a referral market and Metro Vancouver is a small one. Ten happy electrical contractors here is worth more than a hundred logos scattered across a continent. That works against us later, when we're unknown in Seattle.
4. **The privacy stance.** Hard for a GC-facing incumbent to adopt without contradicting its own product.
5. **Model quality.** Real, but a depreciating asset. We should not tell ourselves this is the moat.

**Where we lose:** if Procore ships adequate quantity extraction as a bundled feature before we own the ratio dataset. Mitigation is speed and depth in two trades, and being an obvious acquisition rather than an obstacle.

---

## 6. Why Vancouver — advantages and the honest costs

**Advantages**

- **Regulatory timing.** Bill 20's adjudication regime lands as we launch, and it converts our documentation feature from "nice record-keeping" into a deadline-driven need. No US state offers this tailwind in 2027.
- **Cash-efficient R&D.** As a CCPC we can claim the federal SR&ED refundable ITC at 35% — recently enhanced to a **$6M expenditure limit** — plus **BC's 10% refundable** provincial credit. On eligible engineering salaries with the prescribed proxy, that's a large fraction of our biggest cost line coming back as cash, not a deduction. It is the single strongest financial argument for building here. *(Confirm structure and eligibility with a SR&ED specialist before relying on the modelled figure — see §10.)*
- **Non-dilutive stack.** NRC IRAP for the technical build, on top of SR&ED.
- **Talent.** Deep computer-vision bench from UBC/SFU and the local VFX and games industry, at meaningfully lower cost than the Bay Area, with far lower attrition risk.
- **Currency asymmetry.** CAD cost base, USD revenue the moment we cross into Washington and Oregon. That is structural gross-margin uplift on every US dollar.
- **Dense, walkable beachhead.** A founder can be on four jobsites in a day in Metro Vancouver. The design-partner phase depends on physically standing in trailers, and geography is doing us a favour.

**Honest costs**

- **The home market is too small to be the business.** BC has ~28,225 construction companies, but our ICP band is a few hundred firms province-wide. Vancouver is a beachhead, never the market — see §7.
- **Residential softness.** BuildForce projects BC residential demand slowing through the early 2030s while non-residential grows near-term. Our ICI weighting is the right call here, and the concrete-forming trade choice needs testing against that curve rather than against today's crane count.
- **Thinner pre-seed capital locally.** BC's early-stage market is smaller than Seattle's or SF's; expect to raise from a mix of local angels with construction money and US funds, and plan the US expansion story into the first raise rather than after it.
- **Cross-border operating overhead.** US customers will eventually want US data residency and a US entity for contracting. Cheap to plan for now, expensive to retrofit.

---

## 7. Market sizing (bottom-up)

Three concentric layers, because the home market alone does not support a venture outcome and pretending otherwise would be the fastest way to mislead ourselves.

| Layer | Basis | Value |
|---|---|---|
| **Beachhead — Metro Vancouver + Fraser Valley** | ~200 ICP firms (est.) × $80K ACV | **~$16M** |
| **Home market — British Columbia** | ~300 ICP firms (est.) × $80K ACV | **~$24M** |
| **Cascadia — BC + WA + OR** | ~1,000 ICP firms (est.) × $80K blended | **~$80M** |
| **SAM — North America** | ~18,000–20,000 self-performing subs, $10–150M revenue × $80K | **~$1.5B** |
| **SOM (yr 5)** | ~450 firms, 3 trades, 4 metros × $90K | **~$40M ARR** |

**ACV build (a $40M electrical sub):**
- 18 concurrent projects × $475/project/month = $102K/yr
- Land smaller: 4-project pilot = $22.8K/yr, expanding on renewal
- Blended across the ICP band, allowing for the $10–20M firms: **$80K**

The firm counts are our least defended numbers and are flagged in §13 as validation work. A BC Construction Association / VRCA membership cross-reference and a Statistics Canada business-counts pull by NAICS 238 and employment band should replace the estimates before this plan meets a term sheet.

**The sizing conclusion that matters:** the plan must cross into Washington by roughly month 24, not because Cascadia is exciting but because BC arithmetic caps us around $24M. Build in Vancouver, prove in Vancouver, sell in Seattle.

---

## 8. Pricing

**Per active project, per month. Not per seat.** Seat pricing punishes the customer for putting more crew on capture — exactly the behaviour our data quality depends on. Project pricing scales with delivered value and matches how a sub already thinks about cost coding.

| Tier | Price (CAD) | US list (USD) | Includes |
|---|---|---|---|
| **Pilot** | $16K flat, 90 days, up to 4 projects | $12K | Full product, accuracy report, exit review — refundable against year 1 |
| **Core** | $475 / active project / month | $350 | Production tracking, daily reports, alerts, 1 trade model |
| **Plus** | $700 / active project / month | $525 | + evidence packages (change order and adjudication), multi-trade, bid-rate feedback to estimating, API |

Annual, paid upfront where possible — this ICP tolerates it and it fixes our working capital. Note that US list at near-numeric parity is a deliberate ~25–30% real price increase on cross-border deals, which is standard in this market and helps fund US go-to-market.

**Explicitly not doing:** contingency or success-fee pricing on recovered change orders and adjudication awards. It's the pricing the value story begs for, and it turns us into a claims-consulting firm with software attached — unsellable multiple, adversarial relationship with the GC ecosystem, and it may put us near the line on providing legal services in BC. Revisit only with counsel.

---

## 9. Go to market

**Motion: founder-led, trade-vertical, metro-dense, referral-compounding.** Not PLG. Not inside sales at this stage.

**Phase 1 — Design partners (months 0–6).** Six Metro Vancouver subs, two trades. Free-to-cheap in exchange for capture access, labour data, and brutal weekly feedback. Success = 70%+ crew-day capture and one documented dollar recovery per partner.

**Phase 2 — Paid pilots (months 6–12).** Convert design partners. Add 10–12 paid pilots in the Lower Mainland. Every pilot ends with a written accuracy-and-value review — that document is the sales asset for the next ten.

**Phase 3 — BC + Cascadia (months 12–30).** Victoria and the Interior are marginal; the real second market is **Seattle**, then Calgary. Third trade. First two AEs hired from the trade, not from SaaS.

**Channels, in the order we'd actually work them:**

- **VRCA** (Vancouver Regional Construction Association) — the single highest-leverage room in the beachhead.
- **Trade associations by discipline:** ECABC (electrical), MCABC (mechanical), BCCA provincially, ICBA on the open-shop side.
- **The Bill 20 moment.** Every association, law firm, and surety in the province is running prompt-payment and adjudication education sessions through the regulation rollout. Being useful in those rooms — a genuinely good explainer on what documentation an adjudication actually requires — is the cheapest qualified-lead source we will ever have. Do this as education, not as a pitch.
- **Construction lawyers and claims consultants.** They see the evidence gap first and they are not competitors; they're the ones who tell a sub "you'd have won this if you'd photographed it."
- **Surety brokers and construction-specialist accountants**, who are structurally interested in their clients not losing money on jobs.
- **Timekeeping vendors** (Rhumbix, busybusy, Jonas) as referral partners — test, don't build on.

---

## 10. Financial plan (indicative, CAD)

**Raise:** ~$3.0M pre-seed. 18 months of planned burn; ~22 months of effective runway once SR&ED refunds cycle.

| Use of funds | Share | Notes |
|---|---|---|
| Engineering (4 FTE incl. 2 ML) | 55% | Vision/quantity models, mobile capture, integrations — substantially SR&ED-eligible |
| Field/customer (1 construction-native FTE) | 15% | Ex-PM or ex-estimator from a BC sub; owns pilots and truth |
| Founders | 15% | Below market |
| Compute + data labelling | 8% | Trade-specific annotation is a real line item |
| G&A, legal, insurance | 7% | Construction E&O and a privacy review both matter here |

**Non-dilutive offset.** With engineering as the dominant cost and most of it SR&ED-eligible, the federal 35% refundable ITC (to the enhanced $6M limit) plus BC's 10% refundable credit returns a substantial share of qualifying salary spend as cash, on roughly a 12–18 month lag after each fiscal year. IRAP can fund a defined technical project on top. **Model it conservatively and treat the refund as runway extension, never as revenue** — and get the eligibility position reviewed before the raise, because claiming productization work as research is the classic way a startup's SR&ED claim gets reduced.

**Revenue trajectory (base case):**

| | M6 | M12 | M18 | M24 |
|---|---|---|---|---|
| Paying customers | 0 | 6 | 14 | 30 |
| ARR | $0 | $220K | $750K | $2.0M |
| Gross margin | — | ~55% | ~68% | ~75% |

Early gross margin is deliberately poor: inference cost per project-day plus human-in-the-loop QA on quantity extraction. **The margin curve is the technical milestone.** If QA cost per project doesn't halve between M12 and M24, the model isn't learning and we're a services firm.

**Metrics that decide the seed round:** net revenue retention >120% via project expansion; crew-day capture >70%; quantity accuracy within ±10% on trained scope items; corrections-per-project-week trending down; documented customer dollar recovery per account.

---

## 11. Roadmap

| Quarter | Milestone |
|---|---|
| **Q1** | Electrical rough-in quantity model at ±15%; mobile capture with face blurring at ingest; Canadian-region infrastructure; Procore photo sync; 3 design partners live |
| **Q2** | Labour-hours join (Procore/Jonas/Rhumbix); productivity dashboard; auto daily reports; 6 design partners; ±10% accuracy |
| **Q3** | Evidence packages incl. BC adjudication export, shaped with counsel against the final Bill 20 regulations; concrete forming model; first 3 paid conversions |
| **Q4** | Alerting engine tuned on real drift events; bid-rate feedback to estimating; 6 paying customers, $220K ARR |
| **Y2 H1** | Third trade; $750K ARR; US entity and US data residency groundwork |
| **Y2 H2** | Seattle beachhead; first 2 AEs; benchmark report; seed raise |

---

## 12. Team

**Needed at founding:**
- **Technical founder/CTO** — applied CV/multimodal ML, comfortable that the ground truth is muddy and the users wear gloves.
- **Commercial founder/CEO** — must be able to sit in a trailer in Surrey and be believed. Construction-native beats SaaS-native here, and BC-construction-native beats both.
- **Hire #1: Director of Field Success** — a real ex-PM or ex-chief-estimator from a Lower Mainland sub. Not a customer success hire; this person is the arbiter of whether our numbers are right, and no ML team should be without one.

**Advisors to recruit:** a VP Ops at a $50M+ BC specialty sub; a BC construction lawyer who is actively working the Bill 20 adjudication regime; an estimator who owns bid productivity rates; a privacy counsel for the PIPA and FIPPA position.

---

## 13. Risks, and what kills this

| Risk | Severity | Mitigation / kill criterion |
|---|---|---|
| **Quantity extraction isn't accurate enough from ad-hoc photos** | Existential | 8-week technical spike on real jobsite photos before any raise. **Kill if** we can't hit ±15% on one trade with human-corrected capture. |
| **Foremen don't capture** | Existential | Measured directly in the design-partner phase. **Kill/pivot if** crew-day capture stays under 50% after 8 weeks with an engaged partner. |
| **Union or worker-privacy backlash frames us as surveillance** | High (BC-specific) | The §3.3 stance is non-negotiable and built in from v1; validate it directly with a BC Building Trades contact during discovery rather than discovering it in a sales cycle |
| **Home market too small to reach seed metrics** | High | Cascadia expansion is a plan input, not a later discovery; Seattle groundwork starts in Y2 H1 |
| **Procore or Autodesk bundles it** | High | Depth in two trades, own the hours↔quantity dataset, be acquirable |
| **Labour-hours data dirtier than assumed** (cost coding varies firm to firm) | High | Validate on real exports from 3 BC firms in month 1; may require a normalization layer we haven't scoped |
| **Bill 20 regulations land differently than expected**, or adjudication uptake is slow | Medium | The evidence package has standalone change-order value; the adjudication export is an accelerant, not the foundation. Track the regulation consultation directly. |
| **SR&ED claim reduced** (productization treated as non-eligible) | Medium | Specialist review pre-raise; contemporaneous technical documentation from day one; never model the refund as revenue |
| **BC residential slowdown erodes the concrete-forming beachhead** | Medium | ICI weighting; test trade choice against BuildForce demand curves in discovery |
| **Sales cycle longer than modelled** | Medium | Pilot pricing exists to compress it; watch pilot→paid conversion, not pipeline |
| **Our data used against the customer** in discovery, adjudication, or dispute | Medium | Counsel early; explicit ownership and retention terms; this is a trust market |

**The honest summary of risk:** this business is one technical bet (can we count installed work from a foreman's phone?), one behavioural bet (will he take the photo?), and — because of where we're building — one social bet (will a unionized workforce accept it?). None is settled by argument. All three are cheap to test, and §14 tests them first.

---

## 14. Next 90 days — validation before building

**Days 1–30 — Is the problem worth money here?**
- 25 discovery calls with VPs of Ops at Metro Vancouver ICP subs, sourced through VRCA, ECABC, and MCABC. Structured, same questions, written up. Target output: hours per year lost to late-detected drift, and change orders abandoned for lack of evidence in the last 12 months.
- Obtain real jobsite photo sets + matching labour cost reports + bid takeoffs from 3 BC firms under NDA. **This is the single most valuable artifact of the quarter.**
- Replace the ICP firm-count estimates with a real pull (StatCan business counts by NAICS 238 and employment band, cross-referenced against VRCA/BCCA membership).
- One conversation with a BC Building Trades representative about the §3.3 stance, before we're selling anything.

**Days 31–60 — Can the model do it?**
- Technical spike: quantity estimation on the real photo sets, one trade, measured against as-built quantities. Report accuracy honestly, including abstention rate.
- Prototype the hours↔quantity join on one firm's actual cost codes and find out how dirty the data really is.
- Sit down with a BC construction lawyer: what does an adjudication submission actually need, and what would make our export useful versus decorative?

**Days 61–90 — Will anyone pay?**
- Three signed design-partner LOIs, including data access terms.
- One paid pilot commitment at $16K contingent on the accuracy threshold.
- SR&ED eligibility opinion and a corporate structure that preserves CCPC status through the pre-seed (this constrains who can invest and on what terms — resolve it before the raise, not during).
- Go/no-go against the kill criteria in §13, written down and honored.

---

## 15. Open questions

1. **Trade choice.** Electrical + concrete forming is a guess tuned to this market. Electrical has the best quantity structure and the worst rough-in visibility; forming is the most visually tractable but exposed to the residential curve. Mechanical piping may beat both in BC's institutional pipeline. Decide with discovery data, not preference.
2. **How hard do we lean on Bill 20?** It's the sharpest "why now" we have and the sharpest single point of failure. Leaning on it wins meetings in 2027 and dates the company if adjudication uptake disappoints.
3. **Do we need the bid takeoff?** The ratio needs budgeted units. If subs won't share takeoffs early, we need a cold-start path — crew-relative trending instead of bid-relative.
4. **When do we cross the border?** Month 24 is a placeholder. Earlier de-risks the sizing story for investors; later keeps focus. Pilot conversion rate in Vancouver should decide it.
5. **CCPC status vs. US investors.** The SR&ED advantage is real money and it depends on control staying Canadian. Take a US lead too early and we trade a durable cost advantage for a cheque. Get the structure advice before the raise.
6. **Where does safety fit?** Easiest thing to detect, hardest thing to charge a sub for, and in BC it collides directly with our privacy stance. Probably never the wedge.
7. **Is the GC eventually the better buyer anyway?** Hold it open and let pilot economics answer, rather than defending the sub thesis past the point of evidence.

---

## Sources

- [Bill 20 – 2025: Construction Prompt Payment Act — BC Laws](https://www.bclaws.gov.bc.ca/civix/document/id/bills/billsprevious/1st43rd:gov20-1)
- [BC's Construction Prompt Payment Act: from cash-flow friction to clear framework — Osler](https://www.osler.com/en/insights/blogs/construction/british-columbias-construction-prompt-payment-act-from-cash-flow-friction-to-clear-framework/)
- [BC introduces prompt payment legislation and Builders Lien Act amendments — Miller Thomson](https://www.millerthomson.com/en/insights/construction-and-infrastructure-law/bc-introduces-prompt-payment-legislation-and-builders-lien-act-amendments-is-your-construction-business-ready/)
- [BC Construction Association — industry workforce and company counts](https://bccassn.com/bc-construction-industry-calls-for-government-action-to-sustain-workforce-and-project-momentum/)
- [BuildForce Canada — BC residential and non-residential demand outlook](https://www.buildforce.ca/en/press-release/residential-construction-demands-slow-in-british-columbia-to-2035-while-short-term-non-residential-growth-is-expected-to-be-significant/)
- [SR&ED program enhancements, Bill C-15 — BDO Canada](https://www.bdo.ca/insights/sr-ed-program-enhancements-and-updates-draft-legislation-released)
- [British Columbia SR&ED tax credit guide](https://govmoney.ca/blog/bc-rd-tax-credit-guide)
- [Construction tech funding rounds, 2026 — fundsforNGOs](https://news.fundsforngos.org/2026/05/21/construction-tech-funding-rounds-may-2026-ai-and-automation-startups-attract-fresh-capital/)
- [The real cost of rework in construction — OpenSpace](https://www.openspace.ai/blog/cost-of-rework-in-construction/)
- [How much does field rework in construction actually cost? — ASCE](https://www.asce.org/publications-and-news/civil-engineering-source/article/2026/01/22/how-much-does-field-rework-in-construction-actually-cost)
- [Construction Management Software Market, 2026–2031 — Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/construction-management-software-market)
