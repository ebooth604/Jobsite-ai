# The photo classification service: storage, secret, function, and the door.
#
# Everything here is private by default and reachable only through the API, which
# is itself behind HTTP Basic in the function. That matters more than usual: the
# images are unredacted photographs of identifiable people (face blurring was
# removed by product decision), so the bucket's public-access block and the
# function's auth check are the whole perimeter.

# ---- image storage ----------------------------------------------------------

resource "aws_s3_bucket" "photos" {
  bucket = "${var.name_prefix}-photos"
}

# Versioning buys back the one mistake this app makes easy: a delete is a button
# on a page, and there is no undo in the UI.
resource "aws_s3_bucket_versioning" "photos" {
  bucket = aws_s3_bucket.photos.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# No public access, by all four levers. The browser reaches these objects through
# presigned URLs the function mints; nothing is ever served anonymously.
resource "aws_s3_bucket_public_access_block" "photos" {
  bucket                  = aws_s3_bucket.photos.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Noncurrent versions are a retention liability, not an asset: a deleted photo
# that lingers indefinitely is the opposite of what "delete" implies to a user.
resource "aws_s3_bucket_lifecycle_configuration" "photos" {
  bucket = aws_s3_bucket.photos.id

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# ---- records ----------------------------------------------------------------

# On-demand billing: this table sees a handful of writes a day and long idle
# stretches, which is precisely the shape provisioned capacity bills badly for.
resource "aws_dynamodb_table" "photos" {
  name         = "${var.name_prefix}-photos"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}

# ---- secrets ----------------------------------------------------------------

# One secret holding three values: the basic-auth pair and the model API key.
# Terraform creates the container; the values are written out of band so they
# never enter state. See the README.
resource "aws_secretsmanager_secret" "app" {
  name        = "${var.name_prefix}-classifier"
  description = "Basic-auth credentials and the Anthropic API key for the classifier."

  # A demo that gets torn down and rebuilt should not collide with a scheduled
  # deletion of the previous secret of the same name.
  recovery_window_in_days = 0
}

# ---- function ---------------------------------------------------------------

resource "aws_iam_role" "lambda" {
  name = "${var.name_prefix}-classifier"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "logs" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Scoped to the three resources this function actually touches, and to the verbs
# it actually uses. No wildcards on resources.
resource "aws_iam_role_policy" "app" {
  name = "${var.name_prefix}-classifier"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.photos.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
        ]
        Resource = aws_dynamodb_table.photos.arn
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.app.arn
      },
    ]
  })
}

resource "aws_lambda_function" "app" {
  function_name = "${var.name_prefix}-classifier"
  role          = aws_iam_role.lambda.arn
  handler       = "handler.handler"
  runtime       = "nodejs22.x"

  filename         = var.bundle_path
  source_code_hash = filebase64sha256(var.bundle_path)

  # Classification is a synchronous call to a model that thinks for ten to
  # fifteen seconds a photo, and the batch route does twenty of them in a row.
  # The API Gateway integration caps a response at 30s, so a single classify
  # fits; the batch route is expected to run past the gateway's patience and is
  # driven from the browser one photo at a time instead.
  timeout     = 60
  memory_size = 1024

  environment {
    variables = {
      SITEWIREAI_TABLE     = aws_dynamodb_table.photos.name
      SITEWIREAI_BUCKET    = aws_s3_bucket.photos.bucket
      SITEWIREAI_SECRET_ID = aws_secretsmanager_secret.app.arn
      SITEWIREAI_MODEL     = var.model
      # The API key is deliberately NOT here. It lives in the secret, so it is
      # not readable from the function's configuration page.
    }
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${aws_lambda_function.app.function_name}"
  retention_in_days = 14
}

# ---- the door ---------------------------------------------------------------

resource "aws_apigatewayv2_api" "app" {
  name          = "${var.name_prefix}-classifier"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "app" {
  api_id                 = aws_apigatewayv2_api.app.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.app.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 30000
}

resource "aws_apigatewayv2_route" "app" {
  api_id    = aws_apigatewayv2_api.app.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.app.id}"
}

resource "aws_apigatewayv2_stage" "app" {
  api_id      = aws_apigatewayv2_api.app.id
  name        = "$default"
  auto_deploy = true

  # Access logs are how you find out the gate is being knocked on. Without them a
  # 401 storm looks identical to silence.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      method    = "$context.httpMethod"
      path      = "$context.path"
      status    = "$context.status"
      latency   = "$context.responseLatency"
    })
  }
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/apigateway/${var.name_prefix}-classifier"
  retention_in_days = 14
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.app.execution_arn}/*/*"
}
