# Optional bucket for the removable fixture set (see fixtures/README.md).
#
# Disabled by default. This exists so loading simulated data onto AWS does not
# require improvising a bucket by hand — but it creates no resources until
# someone opts in, because ADR-0001 is not settled and every resource created
# here is another thing that has to move if the cloud decision reverses.
#
#   terraform apply -var environment=dev -var enable_fixture_bucket=true
#
# Delete this file to remove the option entirely.

variable "enable_fixture_bucket" {
  description = "Create a bucket for simulated fixture data. Off by default — see fixtures/README.md."
  type        = bool
  default     = false
}

variable "fixture_expiration_days" {
  description = "Days before fixture objects expire. Temp data should not outlive its purpose."
  type        = number
  default     = 30

  validation {
    condition     = var.fixture_expiration_days > 0 && var.fixture_expiration_days <= 90
    error_message = "Fixture data is temporary: expiry must be between 1 and 90 days."
  }
}

resource "aws_s3_bucket" "fixtures" {
  count = var.enable_fixture_bucket ? 1 : 0

  bucket        = "sitewire-${var.environment}-fixtures-simulated"
  force_destroy = true # it is fixture data; destroying it is the point

  tags = {
    Content   = "simulated-fixture-data"
    Removable = "true"
    # Named on the bucket so nobody has to read a manifest to know what this is.
    Constraint = "may-train-never-measure"
  }
}

# Fixtures are synthetic, but the bucket is still a bucket in a real account.
resource "aws_s3_bucket_public_access_block" "fixtures" {
  count = var.enable_fixture_bucket ? 1 : 0

  bucket                  = aws_s3_bucket.fixtures[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# The removability that does not depend on anyone remembering to run teardown.
resource "aws_s3_bucket_lifecycle_configuration" "fixtures" {
  count = var.enable_fixture_bucket ? 1 : 0

  bucket = aws_s3_bucket.fixtures[0].id

  rule {
    id     = "expire-simulated-fixtures"
    status = "Enabled"

    filter {
      prefix = "_fixtures/"
    }

    expiration {
      days = var.fixture_expiration_days
    }
  }
}

output "fixture_bucket" {
  description = "Bucket for SITEWIRE_FIXTURE_BUCKET, when enabled."
  value       = var.enable_fixture_bucket ? aws_s3_bucket.fixtures[0].bucket : null
}
