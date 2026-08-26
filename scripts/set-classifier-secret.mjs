/**
 * Loads the classifier's secret values into AWS Secrets Manager.
 *
 * Uses the AWS SDK rather than shelling out to the CLI. The CLI route has no
 * good way to pass a secret on Windows: `--secret-string '{"password":"..."}'`
 * writes the credential into shell history and into an argv other local users
 * can read, and the stdin form (`file:///dev/stdin`) is a Unix path that does
 * not exist here. A temp file would work but leaves the password on disk
 * unencrypted between write and delete. The SDK keeps it in this process.
 *
 * Values come from `apps/trainer/.env` (git-ignored), so the password never has
 * to be typed into a terminal or a transcript to be used.
 *
 * Terraform creates the empty secret; this fills it. That split is deliberate —
 * Terraform state is a readable file, and a value passed as a resource argument
 * is written into it in plaintext.
 *
 *   node scripts/set-classifier-secret.mjs [--profile sitewire] [--region ca-central-1]
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const APP = join(ROOT, "apps", "trainer");
const ENV_FILE = join(APP, ".env");

// The SDK is a dependency of the trainer, not of this script's directory, so
// resolution is anchored there rather than relying on hoisting.
const require = createRequire(join(APP, "package.json"));
const { SecretsManagerClient, PutSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const region = arg("region", "ca-central-1");
const secretId = arg("secret-id", "sitewireai-dev-classifier");

/** Minimal .env reader. Values may contain `=`, so only the first one splits. */
function readEnv(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;
    values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return values;
}

const env = readEnv(ENV_FILE);

const username = env.SITEWIREAI_BASIC_AUTH_USER;
const password = env.SITEWIREAI_BASIC_AUTH_PASSWORD;
const apiKey = env.ANTHROPIC_API_KEY;

const missing = [
  !username && "SITEWIREAI_BASIC_AUTH_USER",
  !password && "SITEWIREAI_BASIC_AUTH_PASSWORD",
  !apiKey && "ANTHROPIC_API_KEY",
].filter(Boolean);

if (missing.length > 0) {
  console.error(`Missing from ${ENV_FILE}: ${missing.join(", ")}`);
  process.exit(1);
}

// Exactly these three keys — see loadSecret() in apps/trainer/src/handler.ts.
const payload = JSON.stringify({ username, password, anthropic_api_key: apiKey });

console.log(`• putting secret values into ${secretId} (${region})`);

// Credentials come from the environment, which deploy.ps1 has already bridged.
const client = new SecretsManagerClient({ region });

try {
  await client.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: payload }));
} catch (err) {
  const name = err?.name ?? "";
  if (name === "ResourceNotFoundException") {
    console.error(`\nSecret ${secretId} does not exist. Has terraform apply run?`);
  } else if (name === "AccessDeniedException" || name === "UnrecognizedClientException") {
    console.error("\nCredentials rejected. Run: aws login --profile sitewire");
  } else {
    console.error(`\n${name}: ${err?.message ?? String(err)}`);
  }
  process.exit(1);
}

console.log("✓ secret set");
console.log(`  username: ${username}`);
console.log("  password: (from apps/trainer/.env — not printed)");
console.log("  anthropic_api_key: (set)");
console.log("\nThe Lambda caches the secret per execution environment, so a change");
console.log("takes effect as environments recycle rather than instantly.");
