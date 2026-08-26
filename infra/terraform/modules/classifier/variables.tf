variable "name_prefix" {
  description = "Prefix every resource name is built from, e.g. sitewireai-dev."
  type        = string
}

variable "bundle_path" {
  description = "Path to the built Lambda zip. Produced by scripts/build-classifier.sh."
  type        = string
}

variable "model" {
  description = "Claude model id used for classification."
  type        = string
  default     = "claude-sonnet-5"
}

