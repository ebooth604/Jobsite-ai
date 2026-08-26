output "bucket_name" {
  description = "Name of the corpus bucket."
  value       = aws_s3_bucket.corpus.id
}

output "bucket_arn" {
  description = "ARN of the corpus bucket."
  value       = aws_s3_bucket.corpus.arn
}

output "store_uri" {
  description = "Value for SITEWIREAI_TRAINER_STORE — points the trainer at this corpus."
  value       = "s3://${aws_s3_bucket.corpus.id}/corpus"
}

output "access_policy_arn" {
  description = "Managed policy granting read/write on this corpus. Attached to nothing by design — attach it to a labeller deliberately."
  value       = aws_iam_policy.corpus_access.arn
}
