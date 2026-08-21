# Phase 0 — the accuracy spike

**This is the first thing to build, and nothing else should be built until it reports.**

The entire product rests on one unproven claim: that a model can estimate installed quantities from the ad-hoc photos a foreman already takes, accurately enough that a contractor will act on the number. This harness answers that, against real jobsite photos, before any product code exists.

## The bar

| Measure | Threshold |
|---|---|
| Median absolute percentage error, one trade | **≤ 15%** with human-corrected capture |
| Abstention rate | Reported, not optimised — abstaining is correct behaviour |
| Coverage | ≥ 80% of scope-days produce an estimate or an honest abstention |

**Kill criterion:** if the best estimator cannot reach ±15% on one trade, the plan says stop. Honour it. See `docs/decisions.md` §10.

## What you need first

Not code — data. Three BC firms, under NDA:

1. Jobsite photo sets, ideally as captured (not curated for the demo)
2. Matching **as-built quantities** per scope item — the ground truth
3. The bid takeoff for those scope items

The plan calls this the most valuable artifact of the first quarter, and it is. Everything here is worthless without it.

## Layout

```
spike/
  evaluate.py          the harness — runs an estimator over a labelled set, reports honestly
  estimators/
    base.py            the interface every estimator implements
    baseline.py        a deliberately dumb baseline you must beat
  data/                labelled sets (gitignored — never commit jobsite photos)
```

## Running it

```bash
cd spike
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python evaluate.py --dataset data/electrical_roughin_v1.jsonl --estimator baseline
```

## Reading the result honestly

Three failure modes to watch for, all of which look like success:

- **A low error rate with a high abstention rate.** The model answered only the easy frames. Coverage is reported alongside error for this reason.
- **A low error rate on curated photos.** If the set was assembled by someone choosing good pictures, it measures the curator, not the model. Ask how the set was built.
- **Beating the baseline by a little.** `baseline.py` guesses from scope metadata alone with no vision at all. An estimator that barely beats it has not demonstrated that the photos carry signal.

Report the numbers you get, not the numbers you hoped for. The point of doing this first is that a negative result here is cheap and a negative result after building the product is not.
