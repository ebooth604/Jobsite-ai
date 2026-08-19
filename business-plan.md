# Sitewire — Jobsite AI for Specialty Subcontractors

**Working title. Initial business plan, v0.1 — August 2026.**
Status: pre-seed / pre-incorporation. This document is a decision-making artifact, not a pitch deck. Everything below is an assumption until the validation plan in §12 marks it otherwise.

---

## 1. Executive summary

**What we're building.** A jobsite AI that turns the photos, videos, and voice notes field crews already capture into *installed-quantity production tracking* — how much work went in the ground today, against what was bid, against what the schedule assumed — plus the documentation package needed to get paid for the work that wasn't in the contract.

**Who we sell to.** Mid-market specialty trade subcontractors — electrical, mechanical, concrete, drywall, plumbing — doing $10M–$150M in annual revenue. Not general contractors. Not owners.

**Why that wedge.** Every well-funded jobsite AI company sells to GCs and owners: OpenSpace, Buildots, DroneDeploy, Disperse, Doxel, Trunk Tools. They sell *visibility into the sub's work* to the party that manages the sub. Nobody of consequence sells production intelligence to the sub itself — the party that actually carries the labor risk, eats the rework, and loses the change-order argument for lack of evidence. That is an underserved buyer with a bleeding neck wound and a short purchase cycle.

**Why now.** Three things converged: multimodal models got good enough to count installed work from an unstructured phone photo (this was not true in 2023); jobsite photo capture became universal via ubiquitous phones and Procore/Autodesk photo streams; and margin pressure made contractors buy risk-reduction software rather than productivity software. Capital is concentrating on exactly that thesis — recent rounds include Buildots' $45M Series D, Trunk Tools' $30.5M Series B, and Fyld's $41M Series B.

**The money question.** A $40M-revenue electrical sub running 5–8% net margin loses more to unrecovered change orders and labor-productivity drift on a single bad job than our software costs for three years. We price against recovered dollars, not against seats.

**The ask (indicative).** ~$2.5M pre-seed to reach 12 paying subcontractors, $600K ARR, and a defensible dataset of labor-hours-to-installed-quantity by trade. 18-month runway. See §9.

---

## 2. The problem, stated precisely

A specialty subcontractor bids a job as a quantity takeoff times a labor productivity rate: *N* linear feet of conduit at *X* hours per hundred feet. Everything after the bid is a race between what was assumed and what actually happens in the field.

Today the sub finds out how that race is going through:

- **Foreman daily reports** — free text, filed late, optimistic, and describing activity ("continued rough-in, 2nd floor east") rather than quantity.
- **Weekly labor cost reports from accounting** — accurate, but they tell you hours burned, not work installed. Hours are only half the ratio. By the time the percent-complete correction lands, you're three weeks into a losing job.
- **Project manager instinct** — real skill, but it doesn't scale past the number of jobs one PM can physically walk.

Three costs fall out of that gap:

1. **Late detection of labor drift.** A job that's going to lose 400 hours announces itself in week 3 and is discovered in week 8. The recoverable window closes first.
2. **Unrecovered change orders and delay claims.** The sub does out-of-scope work under schedule pressure, documents it in a text thread, and loses the argument six months later because the GC's version of the site conditions is better-evidenced than the sub's. Industry rework runs roughly 5% of project cost direct, ~9–12% loaded with schedule and supervision drag — a large share of it caused by others and never billed back.
3. **Rework the sub eats.** Installed wrong, discovered late, no photographic record establishing who signed off on the condition.

**The one-line problem:** subs measure hours precisely and installed quantity not at all, and they can't prove site conditions when the money argument starts.

---

## 3. Product

### 3.1 The core loop

1. **Capture.** Crews shoot photos and 30-second walk videos on the phone they already have, or we ingest the photo stream already flowing into Procore / Autodesk Build / a shared drive. No new hardware, no 360 rig, no drone, no BIM model required. This is a deliberate constraint — see §5.
2. **Extract.** Vision models estimate installed quantities against the bid's scope items ("~180 LF of 3/4" EMT, level 2 grid east"), read the room/area from context and floorplan pins, and flag conditions worth remembering (unfinished predecessor work, blocked access, stacked trades, damage).
3. **Reconcile.** Installed quantity is joined to that day's labor hours from the timekeeping system and the bid's budgeted units-per-hour. Output: **a productivity factor per scope item, per crew, per day.**
4. **Alert.** "Level 2 branch conduit is running at 0.71 of bid productivity for six working days. At current rate this scope finishes 320 hours over budget. Top correlated condition: ceiling grid installed ahead of rough-in in 4 of 6 areas."
5. **Document.** When a condition is billable — out-of-sequence work, stacked trades, access denial, differing conditions — the system assembles a dated, geolocated, photo-backed evidence package in the format the change order or delay claim needs.

Step 5 is what gets us renewed. Steps 3–4 are what makes us hard to replace.

### 3.2 v1 scope (first 9 months)

| In | Out (deliberately, for now) |
|---|---|
| Photo/video ingest via mobile app + Procore/Autodesk photo sync | 360° reality capture rigs, drones, laser scanning |
| Quantity estimation for **two trades only** (electrical rough-in, concrete placement) | Every trade |
| Timekeeping integration (Procore, Foundation, Viewpoint Vista, Rhumbix) | Full ERP write-back |
| Auto-drafted daily reports from captured media | Scheduling / P6 integration |
| Productivity-vs-bid dashboard for PM and ops | Owner/GC-facing portal |
| Change-order evidence package export (PDF + photo appendix) | Automated claim submission |
| Weekly ops digest by email | Predictive schedule simulation |

Two trades, not ten. The quantity models are trade-specific, and credibility with a $40M electrical contractor requires being *right*, not broad.

### 3.3 What makes the output trusted

Field software dies of false positives. Three commitments in v1:

- Every number is traceable to the photos that produced it, one click.
- The model reports a confidence band and abstains rather than guessing — an abstention is a "needs 30 seconds of foreman input" nudge, not a silent bad number.
- The foreman can correct any quantity in one tap, and corrections are the training signal. Corrections-per-week is our core quality metric and should fall month over month per customer.

---

## 4. Customer

### 4.1 ICP

- **Firm:** US specialty trade subcontractor, $10M–$150M revenue, 8–40 concurrent projects, self-performing labor, primarily commercial/institutional/industrial.
- **Economic buyer:** VP of Operations or President. In firms this size that person still knows every job by name and personally feels a losing one.
- **Champion:** Chief Estimator or Director of Project Management — the person who owns the bid productivity rates our system is measuring against, and who has wanted this feedback loop their entire career.
- **User:** Foreman (30 seconds/day capture) and PM (5 minutes/day reading).
- **Disqualifiers:** brokers who don't self-perform; residential production builders; firms under ~$8M (no PM layer, can't pay); firms whose GC mandates a competing platform *and* whose contracts strip change-order rights.

### 4.2 Why they buy

Ranked by what actually closes deals, from the value we can demonstrate in a pilot:

1. "You found $180K of billable out-of-scope work on one job that we would have eaten." — pays for itself, undeniably.
2. "You told us job 24-118 was going sideways in week 3." — the ops leader's recurring nightmare.
3. "Our foremen stopped writing daily reports and the reports got better." — adoption lubricant, not a purchase reason.

### 4.3 Why they don't buy

Anticipated objections, with our answers:

- *"My foremen won't use it."* → 30 seconds of capture, on the phone they hold, and their daily report writes itself. If adoption in a pilot falls below 70% of crew-days, we failed and we say so.
- *"We already have Procore."* → Procore stores your photos. It doesn't count what's in them or tell you your productivity factor. We ride on top of it.
- *"Our GC will use this against us."* → The data is ours and the customer's. There is no GC-facing product, by design, and that's a positioning moat as much as a policy.
- *"AI can't count my conduit."* → Correct, in general. It can count it in the two trades we've trained on, and here's the accuracy report from the last four pilots.

---

## 5. Competition and why we're not roadkill

| Player | Sells to | Capture | Their answer to a sub | Our angle |
|---|---|---|---|---|
| **OpenSpace** | GC / owner | 360° rig | Reality capture + visual record | We don't need a rig; we join to *their* labor hours and bid units |
| **Buildots** | GC / owner | 360° helmet cam | Progress vs. BIM schedule | Requires BIM + full schedule; subs have neither at their level |
| **Procore / Autodesk** | GC (+ subs) | Photo storage | System of record + AI features | Platforms, not measurement; we integrate rather than compete |
| **Doxel / Disperse / Avvir** | Owner / GC | Scans, BIM comparison | Capital-project progress verification | Enterprise sale, months-long deploy; wrong motion for a $40M sub |
| **Trunk Tools** | GC | Documents | Agents over project documents | Adjacent, not overlapping; a plausible future partner or acquirer |
| **Safety-vision vendors** | GC / enterprise EHS | Fixed cameras | PPE and zone violation detection | Different buyer, different budget; we may add safety later, we don't lead with it |

**The honest read.** The reality-capture category is well capitalized and largely won at the GC/owner tier. We are not attacking it. We're arguing that the sub is a *separate market* with a separate buyer, separate data (labor hours + bid units, which the GC never sees), and a separate value event (getting paid), and that nobody has built the sub-native product.

**Defensibility, ranked by how much we actually believe it:**

1. **Data.** Installed quantity ↔ labor hours ↔ bid rate, by trade, across firms. Nobody else has both sides of that ratio, because nobody else sells to the party that owns both. This compounds and it is genuinely hard to copy.
2. **Workflow lock.** Once change orders are documented in our format and estimators tune bid rates against our productivity history, we're inside the annual planning cycle.
3. **Trust in the trade.** Subcontracting is a referral market. Ten happy electrical contractors in one metro is worth more than a hundred logos scattered.
4. **Model quality.** Real, but a depreciating asset. We should not tell ourselves this is the moat.

**Where we lose:** if Procore ships adequate quantity extraction as a bundled feature before we own the ratio dataset. Mitigation is speed and depth in two trades, and being an obvious acquisition rather than an obstacle.

---

## 6. Market sizing (bottom-up)

We size the *reachable* market, not the construction-software TAM headline.

| Layer | Basis | Value |
|---|---|---|
| **TAM** — construction management software | Third-party estimates put the category at ~$10–12B in 2026, ~9–11% CAGR | ~$11B |
| **SAM** — US self-performing specialty subs, $10M–$150M revenue | ~18,000 firms (est.) × $60K blended ACV | **~$1.1B** |
| **SOM (yr 5)** — two trades, six metros, referral-led | ~450 firms × $70K ACV | **~$32M ARR** |

**ACV build (a $40M electrical sub):**
- 18 concurrent projects × $350/project/month = $75.6K/yr
- Land smaller: 4-project pilot = $16.8K/yr, expanding on renewal
- Blended assumption across the ICP band, allowing for the $10–20M firms: **$60K**

The 18,000-firm figure is our least defended number and is flagged in §12 as validation work; a Dodge/ConstructConnect firmographic pull should replace the estimate before this plan leaves the building.

---

## 7. Pricing

**Per active project, per month. Not per seat.**

Seat pricing punishes the customer for putting more crew on capture — exactly the behavior our data quality depends on. Project pricing scales with the value delivered and matches how a sub already thinks about cost coding.

| Tier | Price | Includes |
|---|---|---|
| **Pilot** | $12K flat, 90 days, up to 4 projects | Full product, accuracy report, exit review — refundable against year 1 |
| **Core** | $350 / active project / month | Production tracking, daily reports, alerts, 1 trade model |
| **Plus** | $525 / active project / month | + change-order evidence packages, multi-trade, bid-rate feedback to estimating, API |

Annual, paid upfront where possible — this ICP tolerates it and it fixes our working capital.

**Explicitly not doing:** contingency/success-fee pricing on recovered change orders. It's the pricing the value story begs for, and it makes us a claims-consulting firm with software attached — unsellable multiple, adversarial relationship with the GC ecosystem, and a compliance mess in some states. Revisit only with counsel.

---

## 8. Go to market

**Motion: founder-led, trade-vertical, metro-dense, referral-compounding.** Not PLG. Not inside sales at this stage.

**Phase 1 — Design partners (months 0–6).** Six subs, one metro, two trades. Free-to-cheap in exchange for capture access, labor data, and brutal weekly feedback. Sourced from personal network, trade associations (NECA, IEC, ABC chapters), and the estimating community. Success = 70%+ crew-day capture rate and one documented dollar recovery per partner.

**Phase 2 — Paid pilots (months 6–12).** Convert design partners to Core/Plus. Add 10–12 paid pilots in the same metro and trade. Every pilot ends with a written accuracy-and-value review — that document is the sales asset for the next ten.

**Phase 3 — Metro expansion (months 12–24).** Second and third metro, third trade. First two AEs hired from the trade, not from SaaS. Association speaking, trade-press case studies, and an annual *Subcontractor Productivity Benchmark* report built from our own dataset — the dataset is the marketing.

**Channel bets worth testing, not building on:** timekeeping vendors (Rhumbix, busybusy) as referral partners; regional ABC/NECA chapters; construction-focused accounting firms and surety brokers, who are structurally interested in their clients not losing money on jobs.

---

## 9. Financial plan (indicative)

**Raise:** ~$2.5M pre-seed. 18-month runway to a seed-worthy metric set.

**Use of funds:**

| Category | Share | Notes |
|---|---|---|
| Engineering (4 FTE incl. 2 ML) | 55% | Vision/quantity models, mobile capture, integrations |
| Field/customer (1 construction-native FTE) | 15% | Ex-PM or ex-estimator; owns pilots and truth |
| Founders | 15% | Below-market |
| Compute + data labeling | 8% | Trade-specific annotation is a real line item |
| G&A, legal, insurance | 7% | Contractor-facing E&O matters here |

**Revenue trajectory (base case):**

| | M6 | M12 | M18 | M24 |
|---|---|---|---|---|
| Paying customers | 0 | 6 | 14 | 30 |
| ARR | $0 | $180K | $600K | $1.6M |
| Gross margin | — | ~55% | ~68% | ~75% |

Early gross margin is deliberately poor: inference cost per project-day plus human-in-the-loop QA on quantity extraction. The margin curve *is* the technical milestone — if QA cost per project doesn't fall by half between M12 and M24, the model isn't learning and the business is a services firm.

**Metrics that decide the seed round:** net revenue retention (target >120% via project expansion), crew-day capture rate (>70%), quantity accuracy within ±10% on trained scope items, corrections-per-project-week trending down, and documented customer dollar recovery per account.

---

## 10. Roadmap

| Quarter | Milestone |
|---|---|
| **Q1** | Electrical rough-in quantity model at ±15%; mobile capture; Procore photo sync; 3 design partners live |
| **Q2** | Labor-hours join (Procore/Rhumbix); productivity dashboard; auto daily reports; 6 design partners; ±10% accuracy |
| **Q3** | Change-order evidence packages; concrete placement model; first 3 paid conversions |
| **Q4** | Alerting engine tuned on real drift events; bid-rate feedback to estimating; 6 paying customers, $180K ARR |
| **Y2 H1** | Third trade; second metro; first 2 AEs; $600K ARR |
| **Y2 H2** | Benchmark report; partner channel; seed raise |

---

## 11. Team

**Needed at founding:**
- **Technical founder/CTO** — applied CV/multimodal ML, comfortable that the ground truth is muddy and the users wear gloves.
- **Commercial founder/CEO** — must be able to sit in a trailer and be believed. Construction-native is worth more than SaaS-native here.
- **Hire #1: Director of Field Success** — a real ex-PM or ex-chief-estimator from a mid-market sub. This is not a customer success hire; this person is the arbiter of whether our numbers are right, and no ML team should be without one.

**Advisors to recruit:** a VP Ops at a $50M+ specialty sub; a construction claims attorney (change-order evidence has legal shape); an estimator who owns bid productivity rates.

---

## 12. Risks, and what kills this

| Risk | Severity | Mitigation / kill criterion |
|---|---|---|
| **Quantity extraction isn't accurate enough from ad-hoc photos** | Existential | 8-week technical spike on real jobsite photos before any raise. **Kill if** we can't hit ±15% on one trade with human-corrected capture. |
| **Foremen don't capture** | Existential | Design-partner phase measures it directly. **Kill/pivot if** crew-day capture stays under 50% after 8 weeks with an engaged partner. |
| **Procore or Autodesk bundles it** | High | Depth in two trades, own the hours↔quantity ratio dataset, be acquirable |
| **Labor-hours data is dirtier than assumed** (cost coding is inconsistent firm to firm) | High | Validate on real exports from 3 firms in month 1; may require a normalization layer we haven't scoped |
| **Sales cycle longer than modeled** | Medium | Pilot pricing exists to compress it; watch pilot→paid conversion, not pipeline |
| **Our data used against the customer** (subpoena, GC discovery, claim disputes) | Medium | Counsel early; explicit data ownership and retention terms; this is a trust market |
| **Two-trade focus caps the market before the seed** | Medium | Third trade sequenced in Y2 H1; sequencing is a plan input, not a discovery |

**The honest summary of risk:** this business is one technical bet (can we count installed work from a foreman's phone?) and one behavioral bet (will he take the photo?). Neither is settled by argument. Both are cheap to test, and §13 tests them before anything else gets built.

---

## 13. Next 90 days — validation before building

**Days 1–30 — Is the problem worth money?**
- 25 discovery calls with VPs of Ops at ICP subs. Structured, same questions, written up. Target output: how many hours per year they estimate losing to late-detected drift, and how many change orders they abandoned for lack of evidence in the last 12 months.
- Obtain real jobsite photo sets + matching labor cost reports + bid takeoffs from 3 firms under NDA. This is the single most valuable artifact of the quarter.
- Replace the 18,000-firm SAM estimate with a real firmographic pull.

**Days 31–60 — Can the model do it?**
- Technical spike: quantity estimation on the real photo sets, one trade, measured against as-built quantities. Report accuracy honestly, including the abstention rate.
- Prototype the hours↔quantity join on one firm's actual cost codes and find out how dirty the data really is.

**Days 61–90 — Will anyone pay?**
- Three signed design-partner LOIs, including data access terms.
- One paid pilot commitment at $12K contingent on the accuracy threshold.
- Go/no-go against the kill criteria in §12, written down and honored.

---

## 14. Open questions

1. **Trade choice.** Electrical + concrete is a guess. Electrical has the best quantity structure and the worst rough-in visibility; concrete is the most visually tractable but the shortest scope duration. Mechanical piping may beat both. Decide with discovery data, not preference.
2. **Do we need the bid takeoff?** The productivity ratio needs budgeted units. If subs won't share takeoffs early in the relationship, we need a cold-start path (crew-relative trending instead of bid-relative).
3. **Where does safety fit?** It's the easiest thing to detect and the hardest thing to charge a sub for. Probably a retention feature, never the wedge.
4. **Buy vs. build the capture app.** A thin app on top of an existing capture SDK may beat building our own for 12 months.
5. **Is the GC eventually the better buyer anyway?** We should hold this question open and let pilot economics answer it, rather than defending the sub thesis past the point of evidence.

---

## Sources

- [Construction tech funding rounds, 2026 — fundsforNGOs](https://news.fundsforngos.org/2026/05/21/construction-tech-funding-rounds-may-2026-ai-and-automation-startups-attract-fresh-capital/)
- [AI for Construction · Industry Report 2026 — Zacua Ventures](https://zacuaventures.com/ai-for-construction-%C2%B7-industry-report-2026/)
- [Construction Management Software Market Size, 2026–2031 — Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/construction-management-software-market)
- [Construction Software Statistics and Facts (2026) — Scoop/Market.us](https://scoop.market.us/construction-software-statistics/)
- [The real cost of rework in construction — OpenSpace](https://www.openspace.ai/blog/cost-of-rework-in-construction/)
- [How much does field rework in construction actually cost? — ASCE](https://www.asce.org/publications-and-news/civil-engineering-source/article/2026/01/22/how-much-does-field-rework-in-construction-actually-cost)
- [Nonresidential building construction overhead and profit markups — U.S. BLS](https://www.bls.gov/opub/btn/volume-12/nonresidential-building-construction-overhead-and-profit-markups.htm)
- [13 Global Construction AI Companies, 2026 — Mastt](https://www.mastt.com/blogs/construction-ai-companies)
