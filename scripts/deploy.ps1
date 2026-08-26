# Deploys the classifier: credential bridge, terraform apply, then the secret.
#
# PowerShell rather than bash because that is what this machine's terminal runs.
# `&&` is not a statement separator in Windows PowerShell 5.1 and `eval "$(...)"`
# is bash — pasting the Unix form produces a parser error, not a deployment.
#
#   powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
#
# Safe to re-run. Terraform converges, and the secret script overwrites the same
# three values.

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

# --- apply ------------------------------------------------------------------

Push-Location $TfDir
try {
  # A saved plan goes stale once state moves. Re-planning is cheap and removes
  # the "saved plan is no longer valid" failure mode entirely.
  Write-Host '- planning' -ForegroundColor Cyan
  & $Terraform plan -var-file=envs\dev.tfvars -out=tfplan.bin
  if ($LASTEXITCODE -ne 0) { Write-Error 'terraform plan failed' }

  Write-Host '- applying' -ForegroundColor Cyan
  & $Terraform apply tfplan.bin
  if ($LASTEXITCODE -ne 0) { Write-Error 'terraform apply failed' }

  $url = & $Terraform output -raw classifier_url
}
finally {
  Pop-Location
}

# --- secret -----------------------------------------------------------------
#
# Terraform created an empty secret; this fills it. Values come from the
# git-ignored apps/trainer/.env and travel over stdin, so neither the password
# nor the API key lands in shell history.

Write-Host '- setting secret values' -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot 'set-classifier-secret.mjs') --profile $Profile --region $Region
if ($LASTEXITCODE -ne 0) { Write-Error 'setting the secret failed' }

Write-Host ''
Write-Host 'Deployed.' -ForegroundColor Green
Write-Host "  $url"
Write-Host '  username: sitewire'
Write-Host '  password: in apps\trainer\.env (SITEWIREAI_BASIC_AUTH_PASSWORD)'
