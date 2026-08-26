# The application database.
#
# Aurora Serverless v2 reached over the RDS Data API — see the module for why
# that shape rather than a conventional RDS instance in a VPC.
#
# The classifier's role gets query access attached here rather than in the
# classifier module, so the dependency runs one way: the database knows nothing
# about who reads it, and the grant is visible in one place.

module "database" {
  source = "./modules/database"

  name_prefix = local.name_prefix
}

resource "aws_iam_role_policy_attachment" "classifier_db" {
  role       = module.classifier.role_name
  policy_arn = module.database.access_policy_arn
}

output "database_cluster_arn" {
  description = "Cluster ARN. The Data API addresses the database by this."
  value       = module.database.cluster_arn
}

output "database_secret_arn" {
  description = "Credentials secret, passed to the Data API as secretArn."
  value       = module.database.secret_arn
}

output "database_name" {
  description = "Logical database name."
  value       = module.database.database_name
}
