variable "aws_region" {
  description = "AWS region. Must be Canadian — see ADR-0001 and business plan §4.3."
  type        = string
  default     = "ca-central-1"

  validation {
    condition     = can(regex("^ca-", var.aws_region))
    error_message = "Data residency is contractual: the region must be Canadian (ca-*)."
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
