variable "aws_region" {
  description = "AWS region. Canadian only — see ADR-0001 and business plan §4.3."
  type        = string
  default     = "ca-central-1"

  # Kept deliberately, even though inference now leaves Canada.
  #
  # This guard only ever governed where data sits, and it still does that job:
  # without it a stray `-var aws_region=us-east-1` would put the photographs
  # themselves outside Canada, which is strictly worse than the current position
  # of "stored here, classified elsewhere". Relaxing residency for the model call
  # is not a reason to stop pinning the storage.
  validation {
    condition     = can(regex("^ca-", var.aws_region))
    error_message = "Photographs are stored in Canada: the region must be Canadian (ca-*)."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "classifier_model" {
  description = "Claude model id used to classify photographs."
  type        = string
  default     = "claude-sonnet-5"
}
