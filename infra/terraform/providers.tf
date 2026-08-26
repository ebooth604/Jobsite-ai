# The region is pinned here and validated in variables.tf so a misconfigured
# workspace fails at plan time rather than silently placing media outside Canada.
#
# Scope, stated precisely, because this used to say "contractual commitment" and
# that is no longer the whole picture: this pin governs data **at rest**, and it
# still holds — buckets, tables and functions are all in ca-central-1. It says
# nothing about inference. Classification sends photographs to a hosted model
# outside Canada, which business plan §4.3 does not currently permit. See the
# DataResidency tag in locals.tf.

provider "aws" {
  region = var.aws_region

  # Sourced from locals.tf so tags are defined once and every resource inherits the
  # same set, including Environment.
  default_tags {
    tags = local.common_tags
  }
}
