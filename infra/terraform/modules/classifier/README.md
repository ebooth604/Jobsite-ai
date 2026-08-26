# classifier

Photo upload and classification, deployed. DynamoDB for records, S3 for image
bytes, one Lambda behind an HTTP API, HTTP Basic in front of all of it.

## What this is, and what it is not

It is a small internal tool with a shared password. It is **not** a
multi-tenant product surface, and three properties should be understood before
anyone points it at real customer data:

- **The images are unredacted.** Face blurring was removed by product decision.
  These are photographs of identifiable people at work.
- **Authentication is one shared credential.** No accounts, no per-user
  identity, no audit of who did what, and revocation means rotating the secret
  for everybody. §3 of the technical plan calls for Cognito; this is the floor.
- **Classification leaves Canada.** The Lambda calls the Anthropic API. The
  bucket, table and function are all in `ca-central-1`, but the photograph
  itself is sent to a US-hosted model, which the residency commitment in
  business plan §4.3 and ADR-0001 does not permit.

The first two are mitigations you can strengthen. The third is a property of
using a hosted model and cannot be fixed here.

## Secret values are not in Terraform

Terraform creates the secret *container* and nothing else. State is a readable
file; a password or an API key passed as a resource argument is written into it
in plaintext. The values go in out of band:

```bash
aws secretsmanager put-secret-value \
  --profile sitewire --region ca-central-1 \
  --secret-id sitewireai-dev-classifier \
  --secret-string '{"username":"sitewire","password":"<a long random string>","anthropic_api_key":"sk-ant-..."}'
```

The function reads it on first invocation and caches it for the life of the
execution environment, so a rotation takes effect as environments recycle
rather than instantly.

## Deploying

```bash
# 1. Build the bundle. Terraform will not do this for you.
node scripts/build-classifier.mjs

# 2. Apply.
cd infra/terraform
terraform init -reconfigure -backend-config=backends/dev.s3.tfbackend
terraform apply -var-file=envs/dev.tfvars

# 3. Put the secret values in (first deploy only).
#    See above.

# 4. Code-only changes afterwards skip Terraform entirely:
aws lambda update-function-code --profile sitewire --region ca-central-1 \
  --function-name sitewireai-dev-classifier \
  --zip-file fileb://dist/classifier.zip
```

## Why no VPC

The obvious architecture — Lambda in a VPC talking to the existing RDS Postgres
— costs a NAT gateway (~$32/mo) purely so the function can reach the Anthropic
API, which is more than the database. DynamoDB and S3 are reachable from outside
a VPC, so there is no VPC here at all, and the idle RDS instance was deleted.

## Cost

Roughly $1-2/month at demo volume: DynamoDB on-demand and S3 are effectively
free at this scale, Lambda is well inside the free tier, and the real cost is
the model — about half a cent per photograph on Sonnet.
