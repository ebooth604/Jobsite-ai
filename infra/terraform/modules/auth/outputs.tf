output "user_pool_id" {
  description = "User pool id. Also the issuer path segment for JWT verification."
  value       = aws_cognito_user_pool.main.id
}

output "client_id" {
  description = "App client id. The `aud` claim every ID token must carry."
  value       = aws_cognito_user_pool_client.main.id
}

output "client_secret" {
  description = "App client secret. Server-side use only."
  value       = aws_cognito_user_pool_client.main.client_secret
  sensitive   = true
}

output "login_domain" {
  description = "Managed login domain, without scheme."
  value       = "${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
}

output "issuer" {
  description = "OIDC issuer, for JWT verification."
  value       = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}
