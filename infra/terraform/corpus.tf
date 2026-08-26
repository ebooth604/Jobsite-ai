# The training corpus bucket — the first real resource in this root.
#
# Everything else here has been scaffolding: providers, naming, a region guard, and
# remote state. This is storage, which means applying it moves ADR-0001 from "near
# zero reversal cost" to "a bucket exists with data in it". That is the intended
# step, and the ADR was founder-confirmed on 2026-08-24.
#
# It is deliberately the only resource. The trainer runs locally and talks to this
# bucket directly with the labeller's own credentials; there is no Lambda, no API
# route, and nothing public. A hosted labelling surface needs real accounts before
# it needs a URL — see apps/trainer/README.md.

module "corpus_bucket" {
  source = "./modules/corpus-bucket"

  # dev/staging/prod each get their own corpus. A staging corpus that shared prod's
  # bucket would put test labels in the set the accuracy figure is measured against.
  bucket_name = "${local.name_prefix}-corpus"
}
