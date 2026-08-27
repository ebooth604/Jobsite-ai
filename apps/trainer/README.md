# apps/trainer

The fine-tuning engine. **Step three of five**, and the only step where a human
is in the loop.

```
1. Upload        a photo arrives
2. YOLO11        recognition only  →  boxes
3. SAM 2         segmentation only →  masks
4. TRAINER       ← you are here
                 the visual reasoning model sorts, fills in every SiteWire field,
                 and a human confirms what it was unsure about
5. Main app      advanced LLMs write the reports and recommendations
```

Steps 2 and 3 are commodity and isolated to exactly one task each. They produce
**geometry** — where things are — and they never produce **meaning**. That
separation is enforced in `guards.ts`, not just described here: a chain whose
author names a detector or a segmenter is a build-failing violation, because the
one way this architecture quietly dies is a detector's output being laundered into
the interpretation layer that is supposed to be the whole advantage.

Step 4 is where the value is. The reasoning model does the work; humans confirm
only what falls below the review threshold. What comes out is the proprietary
dataset: **visual condition → productivity loss → recommendation → outcome**, tied
back to the pixels that justify it.

One thing worth being precise about: the recommendations recorded here are
*training targets*, not the product's live output. Step 5 generates recommendations
at runtime. This step records what the right answer turned out to be, and whether
acting on it worked — which is the supervision signal step 5 is fine-tuned against.

Local, single-user, and the place real jobsite photos become a corpus a model can
be trained on and — separately, and under stricter rules — measured against.

```bash
corepack pnpm --filter @sitewireai/trainer serve
```

Serves `http://127.0.0.1:4180`. Loopback only, deliberately: this app holds
photographs of real people's workplaces and one customer's quantities.

## Where the data lives

A local directory by default, or an S3 bucket. Same key layout either way —
`samples/<id>.json`, `images/<id>.jpg`, `exports/<cut>/…` — so moving a corpus
between them is a copy, not a migration.

```
samples/   one JSON file per sample, hand-editable
images/    the uploaded photos, and nothing else
exports/   every cut you have made, each with its own dataset card
```

It is a plain key layout on purpose. This corpus is the most valuable thing the
company owns before it owns a model, and a folder you can copy to an external
drive and open in any text editor is a better custodian of that than a schema
only this app can read. `apps/trainer/data/` is gitignored — real jobsite photos
must never reach a repository.

### Local

```bash
SITEWIREAI_TRAINER_STORE=D:/sitewireai-corpus corepack pnpm --filter @sitewireai/trainer serve
```

Defaults to `apps/trainer/data/`. An external or synced drive is the normal
choice once there is more than a session's worth of photos in it.

### S3

The bucket is `infra/terraform/modules/corpus-bucket` — private, encrypted,
versioned, TLS-only, in `ca-central-1`. After `terraform apply`:

```bash
terraform -chdir=infra/terraform output corpus_store_uri
```

Then, and this is the part that costs an hour if you skip it: **the AWS SDK
cannot read `login_session` credentials.** The `sitewire` profile uses
`aws login`, and the SDK reports "Could not load credentials from any providers"
no matter how valid your session is.

Name the profile and the trainer handles it:

```bash
SITEWIREAI_AWS_PROFILE=sitewire SITEWIREAI_TRAINER_STORE=s3://sitewireai-dev-corpus/corpus corepack pnpm --filter @sitewireai/trainer serve
```

The older advice was to bridge credentials into the environment by hand with
`aws configure export-credentials`. That works for about **fifteen minutes**:
the session auto-renews, an exported copy does not, and the process keeps using
a snapshot that has stopped working. The symptom is a feature that runs right
after a restart and 503s by the time you have labelled three photos, which reads
as a bug rather than an expired token. `credentials.ts` asks the CLI on demand
and hands the SDK a provider that knows when to ask again.

The bridge is still respected — if `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` are already set, the trainer leaves them alone rather
than shelling out underneath a deliberate choice.

The startup line prints the corpus location and sample count; `/healthz` reports
the same. If credentials are missing, the region is not `ca-*`, or the URI is
malformed, the process exits with the reason rather than starting a tool that
would accept photographs into nowhere.

Sample metadata is read once at startup and held in memory, so an S3 corpus costs
no round trips to draw a page. Images stream on demand and are served
`immutable` — nothing rewrites those bytes once written.

## The workflow

| Page | What it is for |
|---|---|
| **Intake** | A batch of photos off a phone, filed against a project. Nothing else. |
| **Library** | Everything in the corpus, filtered by trade, source, split or status. Filters live in the URL. |
| **Sample editor** | One photo: draw regions, record the measured quantity and how it was measured, tag conditions and hard cases, set the split. |
| **Review queue** | What is not yet reviewed, oldest first, with what each sample is still missing. |
| **Coverage** | Where the corpus is thin, per trade, and what that stops you claiming. |
| **Export** | Cut a `manifest.jsonl`, a COCO file and a dataset card. |
| **Integrity** | Every rule checked against what is actually on disk. |

## The rules it enforces

These are technical plan §5.4, §5.5 and §11, written as refusals rather than as
conventions people are asked to remember:

- **Simulated data may train a model and may never measure one** (§5.4d). A
  simulated sample can enter `train` and no other split — reviewed or not.
- **The headline held-out set is self-measured** (§5.5). `holdout` takes nothing
  else.
- **The anchor firm calibrates, it does not headline** (§5.4b). As-builts go to
  `calibration`, which is reported alongside the headline figure and never
  blended into it.
- **Nothing measures until a second person has reviewed it.** An unreviewed
  measurement is one person's afternoon, and it will be read as ground truth six
  months from now.
- **A measurement with no stated error bar is refused.** Only a rendered scene is
  exact by construction.
- **Export refuses on any violation**, and checks the whole corpus rather than
  the splits being cut — a leak in a split you are not exporting today is still a
  leak.

`src/guards.ts` is the single implementation of all of this; `src/guards.test.ts`
fails the build if it stops holding. The editor and the server both defer to it,
and the browser never gets its own copy of the rules — the readiness list travels
back with each save.

## What it is not

Not multi-user, not authenticated, not hosted — and deliberately not reachable
from `sitewireai.com`.

The app has no login. Putting it behind a public URL as it stands would publish an
unauthenticated upload, edit and delete endpoint over a corpus of identifiable
workplaces and one customer's commercial position. A second labeller means real
accounts first — §3 already names Cognito for exactly this — not a URL first and
accounts later.

What *is* shared is the corpus. Point two people's local trainers at the same S3
bucket and they are working on one corpus, with the bucket's IAM policy deciding
who may, and CloudTrail recording who did. That gets collaboration without
publishing a write endpoint to the internet.
