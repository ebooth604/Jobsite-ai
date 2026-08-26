# Outputs are the seam other roots and CI steps read. Keeping region and name_prefix
# here means a consumer never re-derives them from raw variables.

output "aws_region" {
  description = "Region this root is deployed into. Guarded to ca-* — see variables.tf."
  value       = var.aws_region
}

output "environment" {
  description = "Deployment environment (dev, staging, or prod)."
  value       = var.environment
}

output "name_prefix" {
  description = "Prefix all resource names in this root are built from."
  value       = local.name_prefix
}

output "common_tags" {
  description = "Tags applied to every resource via the provider's default_tags."
  value       = local.common_tags
}

output "corpus_bucket" {
  description = "Training corpus bucket name."
  value       = module.corpus_bucket.bucket_name
}

output "corpus_store_uri" {
  description = "Set SITEWIREAI_TRAINER_STORE to this to point the trainer at the cloud corpus."
  value       = module.corpus_bucket.store_uri
}

output "corpus_access_policy_arn" {
  description = "Managed policy granting access to the corpus. Attach it deliberately."
  value       = module.corpus_bucket.access_policy_arn
}
