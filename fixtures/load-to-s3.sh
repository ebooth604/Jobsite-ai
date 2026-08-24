#!/usr/bin/env bash
#
# Loads the removable fixture set into S3, under a prefix that exists so it can
# be deleted in one command.
#
# Three guards run before a byte moves, and each one refuses rather than warns:
#   1. the region must be Canadian    — residency is contractual (ADR-0001)
#   2. the prefix must be the quarantine prefix — so teardown stays a one-liner
#   3. verify.mjs must pass           — simulated data must stay identifiable
#
#   SITEWIRE_FIXTURE_BUCKET=my-bucket ./fixtures/load-to-s3.sh
#   ./fixtures/load-to-s3.sh --bucket my-bucket --dry-run
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BUCKET="${SITEWIRE_FIXTURE_BUCKET:-}"
REGION="${AWS_REGION:-ca-central-1}"
PREFIX="${SITEWIRE_FIXTURE_PREFIX:-_fixtures/simulated}"
DRY_RUN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bucket) BUCKET="${2:?--bucket needs a value}"; shift 2 ;;
    --region) REGION="${2:?--region needs a value}"; shift 2 ;;
    --prefix) PREFIX="${2:?--prefix needs a value}"; shift 2 ;;
    --dry-run) DRY_RUN="--dryrun"; shift ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$BUCKET" ]]; then
  echo "error: no bucket. Set SITEWIRE_FIXTURE_BUCKET or pass --bucket." >&2
  exit 2
fi

# Guard 1 — residency. Matches the plan-time guard in infra/terraform/variables.tf.
if [[ ! "$REGION" =~ ^ca- ]]; then
  echo "error: data residency is contractual — region must be Canadian (ca-*), got '$REGION'." >&2
  exit 1
fi

# Guard 2 — the prefix is what makes this removable. Anywhere else and the
# fixture set becomes indistinguishable from real data at teardown time.
PREFIX="${PREFIX%/}"
if [[ "$PREFIX" != _fixtures/* ]]; then
  echo "error: fixture prefix must start with '_fixtures/', got '$PREFIX'." >&2
  echo "       the prefix is the teardown handle; scattering fixtures breaks it." >&2
  exit 1
fi

# Guard 3 — nothing uploads unless every record is still simulated.
node "$HERE/verify.mjs"

# Checked last, so the policy guards above are exercisable without the CLI
# installed — they are the part worth testing in CI.
if ! command -v aws >/dev/null 2>&1; then
  echo "error: the AWS CLI is not installed." >&2
  exit 2
fi

DEST="s3://${BUCKET}/${PREFIX}/"
echo "fixtures: syncing $HERE/out -> $DEST (region $REGION)"

aws s3 sync "$HERE/out" "$DEST" \
  --region "$REGION" \
  --delete \
  --no-progress \
  --metadata "origin=simulated,fixture=true,removable=true" \
  ${DRY_RUN}

if [[ -n "$DRY_RUN" ]]; then
  echo "fixtures: dry run only — nothing uploaded."
else
  echo "fixtures: loaded. Remove with: ./fixtures/teardown-s3.sh --bucket $BUCKET"
fi
