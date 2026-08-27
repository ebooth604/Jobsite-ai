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

import {
  to = module.dashboard.aws_apigatewayv2_api.app
  id = "hbxxny65sd"
}

import {
  to = module.dashboard.aws_apigatewayv2_integration.app
  id = "hbxxny65sd/82wiwmm"
}

import {
  to = module.dashboard.aws_apigatewayv2_route.app
  id = "hbxxny65sd/0pqflu8"
}

import {
  to = module.dashboard.aws_apigatewayv2_stage.app
  id = "hbxxny65sd/$default"
}
