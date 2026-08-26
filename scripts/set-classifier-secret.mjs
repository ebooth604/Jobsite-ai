/**
 * Loads the classifier's secret values into AWS Secrets Manager.
 *
 * Reads them from `apps/trainer/.env` and pipes the JSON to the AWS CLI over
 * stdin. Both details matter: passing `--secret-string '{"password":"..."}'` on
 * the command line writes the password into shell history and into the argument
 * list of a process any other user on the machine can read, and neither is a
 * good place for the credential that guards unredacted photographs.
 *
 * Terraform creates the empty secret; this fills it. That split is deliberate —
 * Terraform state is a readable file, and a value passed as a resource argument
 * is written into it in plaintext.
 *
 *   node scripts/set-classifier-secret.mjs [--profile sitewire] [--region ca-central-1]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ENV_FILE = join(ROOT, "apps", "trainer", ".env");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const profile = arg("profile", "sitewire");
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

// The handler expects exactly these three keys — see loadSecret() in handler.ts.
const payload = JSON.stringify({
  username,
  password,
  anthropic_api_key: apiKey,
});

console.log(`• putting secret values into ${secretId} (${region})`);

try {
  execFileSync(
    "aws",
    [
      "secretsmanager",
      "put-secret-value",
      "--profile", profile,
      "--region", region,
      "--secret-id", secretId,
      // `file:///dev/stdin` is the CLI's read-from-stdin form. The value never
      // becomes an argv entry.
      "--secret-string", "file:///dev/stdin",
      "--output", "json",
    ],
    { input: payload, stdio: ["pipe", "pipe", "inherit"], shell: false },
  );
} catch (err) {
  console.error("\nFailed. Has `terraform apply` run yet? The secret must exist first.");
  process.exit(1);
}

console.log("✓ secret set");
console.log(`  username: ${username}`);
console.log("  password: (in apps/trainer/.env — not printed here)");
console.log("  anthropic_api_key: (set)");
console.log("\nThe Lambda caches the secret per execution environment, so a rotation");
console.log("takes effect as environments recycle rather than instantly.");
