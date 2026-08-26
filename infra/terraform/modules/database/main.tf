# Aurora Serverless v2 PostgreSQL, reached over the RDS Data API.
#
# The Data API is the whole point of this module. A conventional RDS instance is
# private, so a Lambda reaching it needs VPC placement — and a VPC Lambda has no
# route to the internet, which classification requires. That forces a NAT
# gateway at ~$32/mo, more than the database it exists to serve.
#
# The Data API is an HTTPS endpoint reached with SigV4, so the functions stay
# outside the VPC entirely: no subnets, no security groups, no NAT. The cluster
# still lives in the default VPC because it must live somewhere, but nothing
# connects to it on port 5432.
#
# The trade is that this is not a normal Postgres driver. No persistent
# connections, parameters are named and typed rather than positional, and a few
# things (COPY, some cursor patterns) are unavailable. None of that binds on a
# request/response Lambda doing modest queries.

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_db_subnet_group" "main" {
  name       = "${var.name_prefix}-db"
  subnet_ids = data.aws_subnets.default.ids
}

# The master password is generated here and never printed. It is not the
# application's credential — the app authenticates to the Data API with IAM and
# reads this secret only to name the database user.
resource "random_password" "master" {
  length  = 32
  special = false
}

resource "aws_rds_cluster" "main" {
  cluster_identifier = "${var.name_prefix}-db"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned"
  engine_version     = var.engine_version
  database_name      = var.database_name
  master_username    = "sitewire"
  master_password    = random_password.master.result

  db_subnet_group_name = aws_db_subnet_group.main.name

  # The Data API. Without this the whole no-VPC design collapses.
  enable_http_endpoint = true

  storage_encrypted   = true
  skip_final_snapshot = true

  # min_capacity 0 lets the cluster scale to nothing when idle, which is most of
  # the time for a demo. It resumes on the next query with a few seconds of
  # latency — acceptable here, and the difference between roughly free and
  # roughly $43/mo.
  serverlessv2_scaling_configuration {
    min_capacity             = 0
    max_capacity             = var.max_capacity
    seconds_until_auto_pause = 300
  }
}

resource "aws_rds_cluster_instance" "main" {
  identifier         = "${var.name_prefix}-db-1"
  cluster_identifier = aws_rds_cluster.main.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.main.engine
  engine_version     = aws_rds_cluster.main.engine_version
}

# Credentials live in Secrets Manager because that is what the Data API's
# `secretArn` parameter takes — it resolves the secret itself rather than being
# handed a password.
resource "aws_secretsmanager_secret" "db" {
  name                    = "${var.name_prefix}-db"
  description             = "Aurora master credentials, consumed by the RDS Data API."
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = aws_rds_cluster.main.master_username
    password = random_password.master.result
    engine   = "postgres"
    host     = aws_rds_cluster.main.endpoint
    port     = 5432
    dbname   = var.database_name
  })
}

# The policy a function needs to talk to this database. Attached deliberately by
# the caller rather than to anything here.
resource "aws_iam_policy" "access" {
  name        = "${var.name_prefix}-db-access"
  description = "Query ${aws_rds_cluster.main.cluster_identifier} through the Data API."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction",
        ]
        Resource = aws_rds_cluster.main.arn
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.db.arn
      },
    ]
  })
}
