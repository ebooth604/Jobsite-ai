# Canadian data residency is a contractual commitment (business plan §4.3), not a
# provider default we are trusting. The region is pinned here and validated in
# variables.tf so a misconfigured workspace fails at plan time rather than
# silently placing media outside Canada.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project        = "sitewire"
      DataResidency  = "canada"
      ManagedBy      = "terraform"
    }
  }
}
