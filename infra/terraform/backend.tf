# Remote state, configured partially: the bucket is supplied per environment from
# backends/*.s3.tfbackend rather than hard-coded here, so dev state can never be
# initialized against the prod bucket by forgetting a flag.
#
#   terraform init -reconfigure -backend-config=backends/dev.s3.tfbackend
#
# Locking is native to S3 (`use_lockfile` in the backend files) — a lock object held
# beside the state. The older DynamoDB lock table is deprecated and no longer created.
#
# The state bucket is created by bootstrap/, which runs with local state precisely
# because it cannot depend on the backend it creates.
#
# State is residency-bearing: it records bucket names, ARNs, and any attribute a
# resource echoes back, so it lives in ca-central-1 like everything else (§4.3).

terraform {
  backend "s3" {}
}
