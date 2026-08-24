# Bootstrap — the one root that runs with LOCAL state.
#
# It creates the S3 bucket that every other root uses as its backend. It cannot
# itself use that backend, because the backend does not exist until this applies:
# that is the whole reason it is a separate root rather than a module of the main one.
#
# There is no lock table. The S3 backend locks natively via `use_lockfile`, holding a
# lock object beside the state; the DynamoDB table that role used to require is
# deprecated as of Terraform 1.11.
#
# Run once per environment, then commit nothing but the code — terraform.tfstate
# here is gitignored. If it is lost, `terraform import` recovers it; this is one
# bucket, not a footprint.
#
#   terraform init
#   terraform apply -var environment=dev

terraform {
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project       = "sitewire"
      Environment   = var.environment
      DataResidency = "canada"
      ManagedBy     = "terraform"
      Component     = "tfstate"
    }
  }
}

variable "aws_region" {
  description = "AWS region. Must be Canadian — see ADR-0001 and business plan §4.3."
  type        = string
  default     = "ca-central-1"

  validation {
    condition     = can(regex("^ca-", var.aws_region))
    error_message = "Data residency is contractual: the region must be Canadian (ca-*)."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

locals {
  bucket_name = "sitewire-tfstate-${var.environment}"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.bucket_name

  # State is not reproducible from the code that wrote it — a destroyed state bucket
  # orphans every resource it tracked.
  lifecycle {
    prevent_destroy = true
  }
}

# Versioning is the recovery path for a corrupted or truncated state write, which is
# the failure mode that actually happens.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encryption at rest is a §8 checklist item, and state carries resource identifiers
# for everything the roots manage.
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Reject any plaintext PutObject, so a misconfigured backend cannot write unencrypted
# state into a bucket that otherwise looks compliant.
resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyUnencryptedTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.tfstate.arn,
          "${aws_s3_bucket.tfstate.arn}/*",
        ]
        Condition = {
          Bool = { "aws:SecureTransport" = "false" }
        }
      },
    ]
  })
}

output "bucket" {
  description = "State bucket name — matches backends/<env>.s3.tfbackend."
  value       = aws_s3_bucket.tfstate.id
}
