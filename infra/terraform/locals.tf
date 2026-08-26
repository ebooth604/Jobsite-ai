# Naming and tagging are centralized here so every resource added later inherits the
# same identifiers without each module re-deriving them. `name_prefix` is the string
# resource names should be built from — `"${local.name_prefix}-media"`, not a
# hand-written "sitewire-prod-media" that drifts from its siblings.

locals {
  project = "sitewireai"

  name_prefix = "${local.project}-${var.environment}"

  # DataResidency is carried as a tag so the claim is greppable in the console and
  # in Cost Explorer, not only in this repo.
  #
  # It reads `canada-at-rest` rather than `canada` because that is the precise
  # truth as of 2026-08-26: every bucket, table and function is in ca-central-1
  # and stays there, but classification sends the photograph itself to a hosted
  # model outside Canada. The unqualified `canada` this used to say would be read
  # — correctly — as "this data never leaves the country", which is no longer
  # what the system does.
  #
  # If inference moves to a Canadian endpoint (Bedrock on a ca-* inference
  # profile), this goes back to `canada` and business plan §4.3 becomes
  # satisfiable again. Until then the tag must not claim more than the
  # architecture delivers.
  common_tags = {
    Project       = local.project
    Environment   = var.environment
    DataResidency = "canada-at-rest"
    ManagedBy     = "terraform"
  }
}
