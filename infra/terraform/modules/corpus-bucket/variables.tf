variable "bucket_name" {
  description = "Globally unique bucket name. Built from the root's name_prefix so it cannot drift from its siblings."
  type        = string
}

variable "noncurrent_version_retention_days" {
  description = "How long a superseded or deleted object version is kept before expiry. Long enough to undo a mistake, short enough that deleted media actually goes away."
  type        = number
  default     = 90

  validation {
    condition     = var.noncurrent_version_retention_days >= 7
    error_message = "Keep at least a week: a mistake noticed on Monday was often made on Friday."
  }
}
