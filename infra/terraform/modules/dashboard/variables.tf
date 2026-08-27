variable "name_prefix" {
  description = "Prefix names are built from, e.g. sitewireai-dev."
  type        = string
}

# The three names below are the existing hand-made resources, passed in rather
# than derived, because they do not follow the `${name_prefix}-` convention and
# renaming them would replace them. See import.tf.

variable "function_name" {
  description = "Lambda function name. Existing resource — renaming replaces it."
  type        = string
}

variable "role_name" {
  description = "Execution role name. Existing resource — renaming replaces it."
  type        = string
}

variable "api_url" {
  description = "Base URL of the existing HTTP API. Not managed here — see main.tf."
  type        = string
}

variable "bundle_path" {
  description = "Path to the built Lambda zip. Produced by scripts/build-dashboard.mjs."
  type        = string
}

variable "model" {
  description = "Claude model id used for classification."
  type        = string
  default     = "claude-sonnet-5"
}

# ---- resources owned by the classifier module -------------------------------

variable "domain_table_name" {
  description = "DynamoDB table holding organizations and their rows."
  type        = string
}

variable "domain_table_arn" {
  description = "ARN of the domain table, for the IAM grant."
  type        = string
}

variable "bucket_name" {
  description = "Bucket holding capture photographs."
  type        = string
}

variable "bucket_arn" {
  description = "ARN of the photo bucket, for the IAM grant."
  type        = string
}

variable "secret_arn" {
  description = "Secret holding the model API key and the Cognito client secret."
  type        = string
}

# ---- Cognito ----------------------------------------------------------------

variable "user_pool_id" {
  description = "Cognito user pool id."
  type        = string
}

variable "client_id" {
  description = "Cognito app client id."
  type        = string
}

variable "login_domain" {
  description = "Cognito hosted-UI domain."
  type        = string
}
