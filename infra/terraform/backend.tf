# Remote state — see ADR-0004.
#
# Deliberately a *partial* configuration: no bucket, key, or table is named here.
# Values are supplied per environment at init time, which means the bootstrap
# bucket can exist before the config that references it, and no environment can
# accidentally initialise against another's state.
#
#   terraform init -backend-config=envs/dev.backend.hcl
#
# The state bucket lives in ca-central-1 and is not managed by the workspace whose
# state it holds. State carries resource identifiers and attribute values, so the
# residency commitment in business plan §4.3 applies to it too.

terraform {
  backend "s3" {}
}
