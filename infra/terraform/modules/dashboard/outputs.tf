output "url" {
  description = "Base URL of the dashboard. The API is not managed here — see main.tf."
  value       = var.api_url
}

output "function_name" {
  description = "Lambda function name."
  value       = aws_lambda_function.app.function_name
}
