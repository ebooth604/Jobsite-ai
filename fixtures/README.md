# Fixtures — removable simulated data

Synthetic records and placeholder media, generated locally and loadable into
S3, so the AWS side of the system has something to move before any real capture
exists. Nothing here is field data.

**This whole directory is disposable.** It is not a pnpm workspace member,
nothing in `apps/`, `services/`, or `packages/` imports it, and `pnpm check`
does not run it. `rm -rf fixtures/` removes it with no other edit.

## The constraint this data carries

Every capture is stamped `origin: "simulated"`. Under technical plan §5.4d and
§11 that means it **may train a model and may never measure one** — it never
enters a held-out set, and no accuracy figure, internal or customer-facing, may
rest on it. `packages/shared-types` already encodes the type; `verify.mjs`
enforces it on the upload path, because the risk is not today's generator but
tomorrow's hand-edit.

The records also honour the §4 schema constraint: no field aggregates installed
quantity or productivity by individual worker. `captured_by` and `corrected_by`
appear as audit provenance only, and `verify.mjs` fails on a set of
worker-aggregation field names.

## Use

```
node fixtures/generate.mjs                       # writes fixtures/out/ (gitignored)
node fixtures/verify.mjs                         # origin + schema gate
./fixtures/load-to-s3.sh --bucket BUCKET --dry-run
./fixtures/load-to-s3.sh --bucket BUCKET
./fixtures/teardown-s3.sh --bucket BUCKET        # deletes the S3 copy
rm -rf fixtures/out                              # deletes the local copy
```

`SITEWIRE_FIXTURE_BUCKET`, `AWS_REGION` (default `ca-central-1`), and
`SITEWIRE_FIXTURE_PREFIX` (default `_fixtures/simulated`) work in place of the
flags. Generation is deterministic — same seed, identical bytes — so
re-running before a sync uploads nothing new. `--seed` and `--projects` vary the
set.

## What gets generated

`fixtures/out/data/*.json`, one file per entity from technical plan §4 —
organizations, projects, scope items, captures, quantity estimates, corrections,
labour hours, productivity factors — plus `fixtures/out/media/*.png` and a
`manifest.json` naming the constraint and the teardown command.

Two trades are represented separately (electrical rough-in, concrete forming),
per §5.1. Roughly a fifth of estimates abstain and about a third of the rest
carry a foreman correction, so the abstention and training-signal paths both see
traffic rather than a uniform happy path.

The media are banded placeholder PNGs, not renders. They exist to give ingestion
real bytes with real content-types; they carry no ground truth. They also
contain no faces, which is why captures read `face_blur_status:
"no_faces_synthetic"` rather than claiming a blur pass that never ran — the real
gate still has to be built and tested against real media.

## Guards on the upload path

`load-to-s3.sh` refuses, rather than warns, on three conditions:

1. **Non-Canadian region** — residency is contractual (ADR-0001, business plan
   §4.3). Same rule as the plan-time guard in `infra/terraform/variables.tf`.
2. **A prefix outside `_fixtures/`** — the prefix is the teardown handle.
   Fixtures scattered across a bucket cannot be removed in one command, and
   `teardown-s3.sh` refuses a recursive delete outside it for the same reason
   in reverse.
3. **A failing `verify.mjs`** — see the constraint above.

The first two run before the AWS CLI check, so they are exercisable in CI
without AWS installed.

## Bucket

`infra/terraform/fixtures.tf` will create one, disabled by default:

```
terraform apply -var environment=dev -var enable_fixture_bucket=true
```

It blocks public access and expires everything under `_fixtures/` after 30 days
(`-var fixture_expiration_days=N`, max 90) — removability that does not depend
on remembering teardown. Any bucket you already have works just as well; the
file is optional and deletable. It is off by default because ADR-0001 is still
open, and every resource created here is one more thing to move if the cloud
decision reverses.

## What this is not

Not a training set, not a benchmark, and not evidence that any pipeline works.
The quantities are drawn from a seeded PRNG, so a model fitted to them has
learned the PRNG. The point is plumbing: schemas, uploads, wiring, and teardown
exercised end to end before the technical spike reports a real accuracy number.
