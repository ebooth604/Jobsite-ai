# The training corpus bucket.
#
# This holds redacted photographs of real jobsites, the measured quantities taken
# from them, and every export cut made from those. Until there is a model, it is the
# most valuable thing the company owns, and it is also the most sensitive: the
# photographs are of identifiable workplaces, and the quantities are one customer's
# commercial position.
#
# Four properties this module exists to guarantee, in the order they would hurt:
#
#   1. It is never public. Block Public Access is on at the bucket level, and a
#      policy denies any request that arrives without TLS.
#   2. It is encrypted at rest, and a request that asks not to be is refused —
#      encryption that depends on the client remembering is not encryption.
#   3. A mistaken delete is recoverable. Versioning is on; a delete writes a marker
#      rather than destroying bytes, and noncurrent versions age out on a schedule
#      rather than accumulating forever.
#   4. It is in Canada. The region comes from the caller, which validates it — see
#      variables.tf in the root. Residency is contractual (business plan §4.3).
#
# What this module deliberately does NOT do: grant anyone access. The IAM policy
# below is created and attached to nothing. Who may read a corpus of real workers'
# photographs is a decision that wants a human at the moment it is made, not a
# default that shipped with the storage.

resource "aws_s3_bucket" "corpus" {
  bucket = var.bucket_name

  tags = {
    Name    = var.bucket_name
    Purpose = "training-corpus"
    # Greppable in the console and in Cost Explorer. Anyone touching this bucket
    # should know what is in it before they open it.
    Contains = "redacted-jobsite-media-and-ground-truth"
  }
}

resource "aws_s3_bucket_public_access_block" "corpus" {
  bucket = aws_s3_bucket.corpus.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning is the undo button. A labeller deleting the wrong sample, or a bad
# hand-edit to a JSON file, costs a restore rather than a re-shoot.
resource "aws_s3_bucket_versioning" "corpus" {
  bucket = aws_s3_bucket.corpus.id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-S3 rather than KMS: it satisfies encryption at rest with no per-request cost
# and no key to lose. KMS becomes worth its price when there is a customer contract
# that names key custody, or a need to prove a specific key was used — at which
# point this block changes and the bucket does not have to.
resource "aws_s3_bucket_server_side_encryption_configuration" "corpus" {
  bucket = aws_s3_bucket.corpus.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "corpus" {
  bucket = aws_s3_bucket.corpus.id

  # Versioning without expiry means every corrected label keeps its predecessor
  # forever, including the photograph attached to it. Ninety days is long enough to
  # notice and undo a mistake, short enough that deleted media actually goes away.
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_retention_days
    }
  }

  # A failed multipart upload leaves paid-for fragments that no listing shows.
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

data "aws_iam_policy_document" "corpus_bucket" {
  # Encryption in transit, enforced rather than assumed. The AWS SDK uses TLS by
  # default; this makes a misconfiguration fail instead of quietly succeeding.
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:*"]
    resources = [aws_s3_bucket.corpus.arn, "${aws_s3_bucket.corpus.arn}/*"]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  # Encryption at rest, enforced the same way. A PutObject that asks for no
  # encryption is refused rather than silently overriding the bucket default.
  statement {
    sid    = "DenyUnencryptedUploads"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.corpus.arn}/*"]

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["AES256", "aws:kms"]
    }

    # A request that says nothing about encryption gets the bucket default and is
    # fine; only an explicit "none" is refused. Without this the deny would catch
    # every ordinary upload.
    condition {
      test     = "Null"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "corpus" {
  bucket = aws_s3_bucket.corpus.id
  policy = data.aws_iam_policy_document.corpus_bucket.json

  # The policy references the bucket, and Block Public Access must be in place
  # before a policy is attached — otherwise there is a window, however short, where
  # the bucket has a policy and no public-access guard.
  depends_on = [aws_s3_bucket_public_access_block.corpus]
}

# The permissions the trainer needs, as a managed policy attached to nothing.
#
# Attach it to the person or role that does the labelling, deliberately. It is
# scoped to this bucket and to the four operations the app performs — no
# DeleteBucket, no policy changes, no access to any other bucket.
data "aws_iam_policy_document" "corpus_access" {
  statement {
    sid       = "ListTheCorpus"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.corpus.arn]
  }

  statement {
    sid    = "ReadWriteCorpusObjects"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${aws_s3_bucket.corpus.arn}/*"]
  }
}

resource "aws_iam_policy" "corpus_access" {
  name        = "${var.bucket_name}-access"
  description = "Read/write the SiteWireAi training corpus. Attach deliberately — this grants access to real jobsite photographs."
  policy      = data.aws_iam_policy_document.corpus_access.json
}
