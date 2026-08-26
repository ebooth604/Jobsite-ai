# The photo classification service.
#
# `bundle_path` points at a zip that must exist before `terraform apply` — build
# it with `scripts/build-classifier.sh`. Terraform is not asked to build it,
# because a plan that silently rebuilds application code is a plan you cannot
# read.
#
# The secret's *values* are not managed here on purpose. Terraform state is a
# readable file, and a password or an API key written into a resource argument
# ends up in it. The container is created by Terraform; the contents are put
# there by the deploy script.

module "classifier" {
  source = "./modules/classifier"

  name_prefix = local.name_prefix
  bundle_path = "${path.module}/../../dist/classifier.zip"
  model       = var.classifier_model
}

output "classifier_url" {
  description = "Base URL of the classifier. Behind HTTP Basic."
  value       = module.classifier.url
}

output "classifier_bucket" {
  description = "Bucket holding the photographs."
  value       = module.classifier.bucket_name
}

output "classifier_table" {
  description = "DynamoDB table holding photo records."
  value       = module.classifier.table_name
}

output "classifier_secret_name" {
  description = "Secret holding the basic-auth pair and the model API key."
  value       = module.classifier.secret_name
}

output "classifier_function" {
  description = "Lambda function name."
  value       = module.classifier.function_name
}
