variable "name_prefix" {
  description = "Prefix every resource name is built from, e.g. sitewireai-dev."
  type        = string
}

variable "callback_urls" {
  description = "Exact URLs Cognito may redirect to after sign-in. Scheme and path must match."
  type        = list(string)
}

variable "logout_urls" {
  description = "Exact URLs Cognito may redirect to after sign-out."
  type        = list(string)
}
