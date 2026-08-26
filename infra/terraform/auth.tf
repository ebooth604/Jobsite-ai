# Client authentication.
#
# The dashboard is not yet Terraform-managed — it was deployed by hand and lives
# at its own API Gateway URL — so both that origin and the local dev server are
# registered as callbacks. Cognito matches these exactly, including scheme and
# path, so a trailing slash or a missing `http://` is the usual cause of
# `redirect_mismatch`.

module "auth" {
  source = "./modules/auth"

  name_prefix = local.name_prefix

  callback_urls = [
    "http://localhost:4173/auth/callback",
    "https://hbxxny65sd.execute-api.ca-central-1.amazonaws.com/auth/callback",
  ]

  logout_urls = [
    "http://localhost:4173/",
    "https://hbxxny65sd.execute-api.ca-central-1.amazonaws.com/",
  ]
}

output "auth_user_pool_id" {
  description = "Cognito user pool id."
  value       = module.auth.user_pool_id
}

output "auth_client_id" {
  description = "App client id."
  value       = module.auth.client_id
}

output "auth_login_domain" {
  description = "Managed login domain."
  value       = module.auth.login_domain
}

output "auth_issuer" {
  description = "OIDC issuer, for JWT verification."
  value       = module.auth.issuer
}
