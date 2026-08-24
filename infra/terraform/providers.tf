# Canadian data residency is a contractual commitment (business plan §4.3), not a
# provider default we are trusting. The region is pinned here and validated in
# variables.tf so a misconfigured workspace fails at plan time rather than
# silently placing media outside Canada.

provider "aws" {
  region = var.aws_region

  # Sourced from locals.tf so tags are defined once and every resource inherits the
  # same set, including Environment.
  default_tags {
    tags = local.common_tags
  }
}
