# Naming and tagging are centralized here so every resource added later inherits the
# same identifiers without each module re-deriving them. `name_prefix` is the string
# resource names should be built from — `"${local.name_prefix}-media"`, not a
# hand-written "sitewire-prod-media" that drifts from its siblings.

locals {
  project = "sitewire"

  name_prefix = "${local.project}-${var.environment}"

  # DataResidency is carried as a tag so the commitment is greppable in the console
  # and in Cost Explorer, not only in this repo. Business plan §4.3.
  common_tags = {
    Project       = local.project
    Environment   = var.environment
    DataResidency = "canada"
    ManagedBy     = "terraform"
  }
}
