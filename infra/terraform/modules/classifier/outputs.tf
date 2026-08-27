output "url" {
  description = "Base URL of the classifier. Behind HTTP Basic."
  value       = aws_apigatewayv2_stage.app.invoke_url
}

output "bucket_name" {
  description = "Bucket holding the photographs. Private; no public access."
  value       = aws_s3_bucket.photos.bucket
}

output "table_name" {
  description = "DynamoDB table holding photo records and their classifications."
  value       = aws_dynamodb_table.photos.name
}

output "domain_table_name" {
  description = "DynamoDB table holding organizations, projects and their rows."
  value       = aws_dynamodb_table.domain.name
}

output "secret_arn" {
  description = "Secret holding the basic-auth pair and the model API key."
  value       = aws_secretsmanager_secret.app.arn
}

output "secret_name" {
  description = "Secret name, for the aws secretsmanager put-secret-value call."
  value       = aws_secretsmanager_secret.app.name
}

output "function_name" {
  description = "Lambda function name, for update-function-code and logs."
  value       = aws_lambda_function.app.function_name
}

output "role_name" {
  description = "Execution role name, so callers can attach further grants to it."
  value       = aws_iam_role.lambda.name
}

output "domain_table_arn" {
  description = "ARN of the domain table, so another module can be granted access without redeclaring it."
  value       = aws_dynamodb_table.domain.arn
}

output "bucket_arn" {
  description = "ARN of the photo bucket, for grants made outside this module."
  value       = aws_s3_bucket.photos.arn
}
