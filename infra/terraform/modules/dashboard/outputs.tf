output "url" {
  description = "Base URL of the dashboard."
  value       = aws_apigatewayv2_stage.app.invoke_url
}

output "function_name" {
  description = "Lambda function name."
  value       = aws_lambda_function.app.function_name
}

output "api_id" {
  description = "HTTP API id. Baked into the Cognito callback URLs."
  value       = aws_apigatewayv2_api.app.id
}
