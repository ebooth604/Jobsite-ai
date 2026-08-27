# The client dashboard and the admin console.
#
# This function was deployed by hand in August 2026 and stayed that way while
# three milestones of work — multi-tenancy, Cognito sign-in, the admin console —
# landed in the repository and nowhere else. The published URL still served the
# code from before any of it, because there was no path from a commit to the
# thing customers can reach.
#
# So the existing Lambda, its role and its HTTP API are **imported** rather than
# recreated (see `import.tf`). The API id is baked into the Cognito callback
# URLs and into every link that has been shared; replacing it would invalidate
# both to save an import block.
#
# The photo bucket and the domain table are *not* declared here. They belong to
# the classifier module, which created them, and a resource declared in two
# modules is a resource two plans fight over. They arrive as variables.

# ---- identity ---------------------------------------------------------------

resource "aws_iam_role" "lambda" {
  name = var.role_name

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

# Scoped to what the dashboard actually touches.
#
# **`dynamodb:Scan` is deliberately absent.** Every read in this application is
# partitioned by organization — that is what makes cross-tenant access
# structurally impossible rather than merely filtered — and Scan is the one verb
# that would hand the function the ability to read across every tenant at once.
# Granting it "just in case" would quietly undo the property milestone 1 exists
# to establish.
resource "aws_iam_role_policy" "app" {
  name = "${var.name_prefix}-dashboard"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchWriteItem",
        ]
        Resource = var.domain_table_arn
      },
      {
        # GetObject so the classification pages can presign a stored capture,
        # PutObject so an upload can be written. DeleteObject because the admin
        # console removes a capture's photograph along with its row.
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "${var.bucket_arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.secret_arn
      },
    ]
  })
}

# ---- the function -----------------------------------------------------------

resource "aws_lambda_function" "app" {
  function_name = var.function_name
  role          = aws_iam_role.lambda.arn
  handler       = "handler.handler"
  runtime       = "nodejs22.x"

  filename         = var.bundle_path
  source_code_hash = filebase64sha256(var.bundle_path)

  # A capture upload runs the classifier inline, which thinks for ten to fifteen
  # seconds. The API Gateway integration caps a response at 30s, so the function
  # is given more than the gateway will wait for: the work still completes and
  # the row is still written even when the browser has already given up.
  timeout     = 60
  memory_size = 1024

  environment {
    variables = {
      SITEWIREAI_DOMAIN_TABLE = var.domain_table_name
      SITEWIREAI_BUCKET       = var.bucket_name
      SITEWIREAI_MODEL        = var.model
      SITEWIREAI_SECRET_ID    = var.secret_arn

      # Cognito. Ids and the pool are not secret — they appear in the redirect
      # URL a browser follows — so they are configuration. The client *secret*
      # is not here; it lives in the secret above and is read at cold start.
      SITEWIREAI_USER_POOL_ID = var.user_pool_id
      SITEWIREAI_CLIENT_ID    = var.client_id
      SITEWIREAI_LOGIN_DOMAIN = var.login_domain

      # Absent on purpose, and absent is the point: no `SITEWIREAI_DEV_ORG_SWITCH`.
      # The `?org=` switcher only applies when that variable is "1", so production
      # cannot be talked into rendering another tenant by query string.
    }
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/aws/lambda/${aws_lambda_function.app.function_name}"
  retention_in_days = 14
}

# ---- the door ---------------------------------------------------------------

resource "aws_apigatewayv2_api" "app" {
  name          = var.api_name
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
  name              = "/aws/apigateway/${var.name_prefix}-dashboard"
  retention_in_days = 14
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.app.execution_arn}/*/*"
}
