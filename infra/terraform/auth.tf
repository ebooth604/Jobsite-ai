# Client authentication.
#
# **Every origin the site can be reached from has to be listed here.**
#
# The app builds `redirect_uri` from the Host header of the request, so someone
# arriving at sitewireai.com is sent to Cognito asking to return to
# sitewireai.com — and Cognito refuses any URI it was not given in advance, with
# the deliberately vague "An error was encountered with the requested page".
# Nothing appears in the application's logs, because the request never reaches
# the application.
#
# That is exactly how sign-in broke on 2026-08-27. The list held the API Gateway
# origin, sign-in was tested there and worked, and the custom domain — the one an
# actual visitor types — was missing. Testing the URL you deployed rather than
# the URL people use is what made it invisible.
#
# Apex and `www` are both listed because both resolve. Cognito matches the string
# exactly: scheme, host and path, with a trailing slash counting as a difference.

module "auth" {
  source = "./modules/auth"

  name_prefix = local.name_prefix

  callback_urls = [
    "http://localhost:4173/auth/callback",
    "https://hbxxny65sd.execute-api.ca-central-1.amazonaws.com/auth/callback",
    "https://sitewireai.com/auth/callback",
    "https://www.sitewireai.com/auth/callback",
  ]

  logout_urls = [
    "http://localhost:4173/",
    "https://hbxxny65sd.execute-api.ca-central-1.amazonaws.com/",
    "https://sitewireai.com/",
    "https://www.sitewireai.com/",
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
