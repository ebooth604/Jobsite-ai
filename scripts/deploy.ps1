# Deploys both functions: credential bridge, bundles, terraform apply, secret.
#
# This used to deploy only the classifier, which is why three milestones of
# dashboard work sat finished in the repository and served nowhere.
#
# PowerShell rather than bash because that is what this machine's terminal runs.
# `&&` is not a statement separator in Windows PowerShell 5.1 and `eval "$(...)"`
# is bash — pasting the Unix form produces a parser error, not a deployment.
#
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
#
# Safe to re-run. Terraform converges, and the secret script overwrites the same
# four values.
#
# **One-time step before the first run.** The API's integration, route and stage
# were made by "quick create" and the AWS provider cannot import those, so they
# have to be deleted once and let Terraform recreate them. The API itself keeps
# its id — `hbxxny65sd`, which is written into the Cognito callback URLs and
# every shared link. Route first; it holds a reference to the integration:
#
#   aws apigatewayv2 delete-route       --api-id hbxxny65sd --route-id 0pqflu8       --profile sitewire --region ca-central-1
#   aws apigatewayv2 delete-integration --api-id hbxxny65sd --integration-id 82wiwmm --profile sitewire --region ca-central-1
#   aws apigatewayv2 delete-stage       --api-id hbxxny65sd --stage-name '$default'  --profile sitewire --region ca-central-1
#
# The dashboard URL is down between that third command and the apply below.

$ErrorActionPreference = 'Stop'

$Repo      = Split-Path -Parent $PSScriptRoot
$TfDir     = Join-Path $Repo 'infra\terraform'
$Terraform = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Hashicorp.Terraform_Microsoft.Winget.Source_8wekyb3d8bbwe\terraform.exe"
$Profile   = 'sitewire'
$Region    = 'ca-central-1'

if (-not (Test-Path $Terraform)) {
  Write-Error "terraform.exe not found at $Terraform"
}

# --- credentials ------------------------------------------------------------
#
# Terraform's AWS provider cannot read this profile's `login_session` credentials
# directly — it reports "No valid credential sources found". Exporting them into
# the environment is the documented bridge. The copy is a frozen snapshot that
# expires in ~15 minutes, which is ample for an apply and useless for a server.

Write-Host '- bridging credentials' -ForegroundColor Cyan
$creds = & aws configure export-credentials --profile $Profile --format process | ConvertFrom-Json
if (-not $creds.AccessKeyId) { Write-Error "Could not export credentials. Run: aws login --profile $Profile" }

$env:AWS_ACCESS_KEY_ID     = $creds.AccessKeyId
$env:AWS_SECRET_ACCESS_KEY = $creds.SecretAccessKey
$env:AWS_SESSION_TOKEN     = $creds.SessionToken
$env:AWS_REGION            = $Region

# --- bundles ----------------------------------------------------------------
#
# Terraform hashes these zips, so they must exist and be current before the plan
# runs. Building them here rather than from Terraform keeps the plan readable:
# a plan that silently rebuilds application code is a plan you cannot trust.

Write-Host '- building bundles' -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot 'build-classifier.mjs')
if ($LASTEXITCODE -ne 0) { Write-Error 'building the classifier bundle failed' }
& node (Join-Path $PSScriptRoot 'build-dashboard.mjs')
if ($LASTEXITCODE -ne 0) { Write-Error 'building the dashboard bundle failed' }

# --- apply ------------------------------------------------------------------

# Arguments are quoted and passed as an array, not written inline.
#
# Windows PowerShell 5.1 mangles an unquoted native argument of the shape
# `-var-file=envs\dev.tfvars`, and terraform receives it as two tokens — the
# second of which it reads as a positional directory, hence "Too many command
# line arguments. To specify a working directory, use -chdir". Quoting each
# argument passes it through intact.
Push-Location $TfDir
try {
  # A saved plan goes stale once state moves. Re-planning is cheap and removes
  # the "saved plan is no longer valid" failure mode entirely.
  Write-Host '- planning' -ForegroundColor Cyan
  & $Terraform @('plan', '-var-file=envs\dev.tfvars', '-out=tfplan.bin')
  if ($LASTEXITCODE -ne 0) { Write-Error 'terraform plan failed' }

  Write-Host '- applying' -ForegroundColor Cyan
  & $Terraform @('apply', 'tfplan.bin')
  if ($LASTEXITCODE -ne 0) { Write-Error 'terraform apply failed' }

  $url = & $Terraform @('output', '-raw', 'classifier_url')
  $dashboardUrl = & $Terraform @('output', '-raw', 'dashboard_url')
}
finally {
  Pop-Location
}

# --- secret -----------------------------------------------------------------
#
# Terraform created an empty secret; this fills it. Values come from the
# git-ignored apps/trainer/.env and apps/dashboard/.env and stay inside the
# node process, so nothing secret lands in shell history or in Terraform state.
#
# One secret serves both functions: the classifier reads the basic-auth pair and
# the API key, the dashboard reads the API key and the Cognito client secret.

Write-Host '- setting secret values' -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot 'set-classifier-secret.mjs') --profile $Profile --region $Region
if ($LASTEXITCODE -ne 0) { Write-Error 'setting the secret failed' }

Write-Host ''
Write-Host 'Deployed.' -ForegroundColor Green
Write-Host "  dashboard:  $dashboardUrl"
Write-Host "  classifier: $url"
Write-Host '  classifier username: sitewire'
Write-Host '  classifier password: in apps\trainer\.env (SITEWIREAI_BASIC_AUTH_PASSWORD)'
Write-Host ''
Write-Host 'Both functions cache the secret per execution environment, so a' -ForegroundColor DarkGray
Write-Host 'rotation takes effect as environments recycle rather than instantly.' -ForegroundColor DarkGray
