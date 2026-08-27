# Adopting the hand-made dashboard.
#
# The dashboard Lambda, its role and its HTTP API were created by hand in August
# 2026, before there was a module for them. Three milestones of work then landed
# in the repository and never reached that function, because nothing connected a
# commit to it.
#
# These blocks bring the existing resources under management instead of creating
# new ones. That matters most for the API: its id, `hbxxny65sd`, is written into
# the Cognito callback URLs in auth.tf and into every link that has been shared.
# Recreating it would break sign-in and every bookmark to save writing this file.
#
# **Import blocks are safe to leave in place.** Once a resource is in state
# Terraform treats its import block as a no-op, so these are a record of how the
# resources were adopted rather than something to remember to delete. If a plan
# ever shows one of them as *creating* rather than importing, the resource was
# deleted outside Terraform and that is worth knowing before applying.

import {
  to = module.dashboard.aws_lambda_function.app
  id = "sitewireai-dashboard"
}

import {
  to = module.dashboard.aws_iam_role.lambda
  id = "sitewireai-dashboard-role"
}

# The integration, route and stage are NOT imported.
#
# They were made by "quick create" (`create-api --target`), and the AWS provider
# refuses to import resources created that way — it errors with
# "was created via quick create" and nothing adopts them. So they are deleted
# before the apply and Terraform makes them fresh.
#
# The API itself is imported and keeps its id, which is the part that matters:
# `hbxxny65sd` is written into the Cognito callback URLs in auth.tf and into
# every link that has been shared. Its children are replaceable; its id is not.
#
# Deleting them takes the URL down until the apply recreates them, which is why
# it is a deliberate step in deploy.ps1 rather than something that happens
# quietly. Order matters: a route holds a reference to its integration, so the
# route goes first or the integration delete is refused.

# The log group, created by Lambda itself on the function's first invocation.
#
# AWS makes `/aws/lambda/<function>` implicitly the first time a function runs,
# so declaring it in Terraform without this fails with
# ResourceAlreadyExistsException. Importing it is also what puts a retention
# policy on it: an implicitly created group keeps logs forever, which is a slow
# bill rather than a broken deploy, and therefore easy to miss.
import {
  to = module.dashboard.aws_cloudwatch_log_group.app
  id = "/aws/lambda/sitewireai-dashboard"
}
