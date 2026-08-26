# Cognito user pool: real client logins, replacing the ?org= dev switcher.
#
# **Confidential client, not public.** The dashboard is server-rendered, so the
# authorization-code exchange happens on the server where a client secret can
# actually be kept. PKCE exists for public clients — a browser or mobile app that
# cannot hold a secret — and is not the right shape here.
#
# **Which org a user belongs to is a custom attribute on the user**, carried in
# the ID token. That keeps tenancy resolution to one claim read, with no lookup
# on the request path and nothing for a caller to influence.

resource "aws_cognito_user_pool" "main" {
  name = "${var.name_prefix}-users"

  # Email is the username. Construction staff will not remember a separate one.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_uppercase                = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # Admin-created accounts only. There is no public sign-up for a product where
  # an account implies access to a specific customer's jobsite photographs — a
  # self-serve form would have no way to decide which tenant a stranger joins.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  # The tenant binding. Mutable so an operator can move a user between orgs
  # without recreating them; the app treats a missing value as "no access".
  schema {
    name                     = "orgId"
    attribute_data_type      = "String"
    mutable                  = true
    required                 = false
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 1
      max_length = 128
    }
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # MFA is OPTIONAL rather than off: a user can enrol TOTP, and the pool is
  # ready to have it required per-group later without a migration.
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }
}

resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.name_prefix}-dashboard"
  user_pool_id = aws_cognito_user_pool.main.id

  # Server-side exchange, so a secret is both safe and appropriate.
  generate_secret = true

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # The client must be able to read the tenant binding, or the claim never
  # reaches the ID token and every request resolves to no organization.
  read_attributes  = ["email", "email_verified", "custom:orgId"]
  write_attributes = ["email"]

  # Eight hours: long enough for a working day without refresh-token plumbing,
  # short enough that a stolen cookie is not indefinite. Refresh handling is the
  # follow-up that lets this come down to the usual hour.
  id_token_validity      = 8
  access_token_validity  = 8
  refresh_token_validity = 30

  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.name_prefix}-login"
  user_pool_id = aws_cognito_user_pool.main.id

  # Version 1 — the classic hosted UI — deliberately, not for lack of trying v2.
  #
  # Managed login v2 is the successor and is what you want eventually: it brings
  # a branding designer and is required for passkeys and native OTP. But v2 is
  # unavailable for an app client until a branding style exists for it, the
  # console creates one automatically while the API does not, and the Terraform
  # resource for it (`aws_cognito_managed_login_branding`) does not exist in AWS
  # provider 5.x. Reaching v2 therefore means either a provider major-version
  # upgrade or an out-of-band CLI call the deploy script has to remember.
  #
  # Neither is worth it for a flow that is username and password today. v1
  # serves sign-in, MFA enrolment and password reset perfectly well. Revisit
  # when passkeys are actually wanted, and do the provider upgrade deliberately
  # rather than as a side effect of this.
  managed_login_version = 1
}
