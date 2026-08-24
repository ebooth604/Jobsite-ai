terraform {
  # >= 1.11: the S3 backend's native state locking (`use_lockfile`) is GA here.
  # Below that it does not exist and locking would silently fall back to nothing.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
