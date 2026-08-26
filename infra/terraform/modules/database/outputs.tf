output "cluster_arn" {
  description = "Cluster ARN. The Data API addresses the database by this, not by a hostname."
  value       = aws_rds_cluster.main.arn
}

output "secret_arn" {
  description = "Credentials secret. Passed to the Data API as secretArn."
  value       = aws_secretsmanager_secret.db.arn
}

output "database_name" {
  description = "Logical database name."
  value       = var.database_name
}

output "access_policy_arn" {
  description = "Managed policy granting Data API access. Attach it to a function's role."
  value       = aws_iam_policy.access.arn
}
