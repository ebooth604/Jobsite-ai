#!/usr/bin/env bash
#
# Removes the fixture set from S3. This is the other half of "removable" —
# a fixture load nobody can reverse is just data with a hopeful name.
#
#   ./fixtures/teardown-s3.sh --bucket my-bucket
#   ./fixtures/teardown-s3.sh --bucket my-bucket --yes    # skip the prompt
#
set -euo pipefail

BUCKET="${SITEWIRE_FIXTURE_BUCKET:-}"
REGION="${AWS_REGION:-ca-central-1}"
PREFIX="${SITEWIRE_FIXTURE_PREFIX:-_fixtures/simulated}"
ASSUME_YES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bucket) BUCKET="${2:?--bucket needs a value}"; shift 2 ;;
    --region) REGION="${2:?--region needs a value}"; shift 2 ;;
    --prefix) PREFIX="${2:?--prefix needs a value}"; shift 2 ;;
    --yes|-y) ASSUME_YES="1"; shift ;;
    -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$BUCKET" ]]; then
  echo "error: no bucket. Set SITEWIRE_FIXTURE_BUCKET or pass --bucket." >&2
  exit 2
fi

# The same prefix guard as the loader, for the opposite reason: a recursive
# delete pointed outside the quarantine prefix could take real data with it.
PREFIX="${PREFIX%/}"
if [[ "$PREFIX" != _fixtures/* ]]; then
  echo "error: refusing to recursively delete a prefix outside '_fixtures/', got '$PREFIX'." >&2
  exit 1
fi

TARGET="s3://${BUCKET}/${PREFIX}/"

echo "fixtures: this will recursively delete $TARGET"
aws s3 ls "$TARGET" --recursive --region "$REGION" --summarize | tail -n 3 || true

if [[ -z "$ASSUME_YES" ]]; then
  read -r -p "delete everything under that prefix? [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "aborted."; exit 0; }
fi

aws s3 rm "$TARGET" --recursive --region "$REGION" --no-progress
echo "fixtures: removed $TARGET"
echo "fixtures: local copy still at fixtures/out — remove with: rm -rf fixtures/out"
