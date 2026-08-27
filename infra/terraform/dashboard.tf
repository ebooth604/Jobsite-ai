# The client dashboard and admin console.
#
# It shares the classifier's bucket, domain table and secret rather than
# declaring its own. One photo store and one tenant store is the design — a
# capture uploaded from the dashboard is the same object the classifier reads —
# and two modules declaring the same resource is a resource two plans fight over.
#
# `bundle_path` must exist before `terraform apply`; build it with
# `node scripts/build-dashboard.mjs`. Terraform is deliberately not asked to
# build it: a plan that silently rebuilds application code is a plan you cannot
# read.

module "dashboard" {
  source = "./modules/dashboard"

  name_prefix = local.name_prefix
  bundle_path = "${path.module}/../../dist/dashboard.zip"
  model       = var.classifier_model

  # Existing names, kept exactly. See import.tf for why.
  function_name = "sitewireai-dashboard"
  role_name     = "sitewireai-dashboard-role"
  api_name      = "sitewireai-api"

  domain_table_name = module.classifier.domain_table_name
  domain_table_arn  = module.classifier.domain_table_arn
  bucket_name       = module.classifier.bucket_name
  bucket_arn        = module.classifier.bucket_arn
  secret_arn        = module.classifier.secret_arn

  user_pool_id = module.auth.user_pool_id
  client_id    = module.auth.client_id
  login_domain = module.auth.login_domain
}

output "dashboard_url" {
  description = "Base URL of the client dashboard and admin console."
  value       = module.dashboard.url
}

output "dashboard_function" {
  description = "Lambda function name, for update-function-code and logs."
  value       = module.dashboard.function_name
}
