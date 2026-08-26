/**
 * Loads the synthetic tenants into the domain table.
 *
 * Idempotent — every write is a Put on a deterministic key, so re-running
 * converges on the seed rather than duplicating.
 *
 *   node scripts/seed-db.mjs [--table sitewireai-dev-domain] [--region ca-central-1]
 */

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

process.env.SITEWIREAI_DOMAIN_TABLE = arg("table", "sitewireai-dev-domain");
process.env.AWS_REGION = arg("region", process.env.AWS_REGION ?? "ca-central-1");

// Resolution is anchored at the package that owns the dependency rather than
// relying on hoisting.
const require = createRequire(join(ROOT, "packages", "db", "package.json"));
require.resolve("@aws-sdk/lib-dynamodb");

const db = await import(
  new URL(`file:///${join(ROOT, "packages", "db", "dist", "index.js").replace(/\\/g, "/")}`)
);

console.log(`• seeding ${process.env.SITEWIREAI_DOMAIN_TABLE} (${process.env.AWS_REGION})`);

try {
  await db.seedAll();
} catch (err) {
  console.error(`\nFailed: ${err?.name ?? ""} ${err?.message ?? String(err)}`);
  console.error("Has terraform apply run? Are AWS credentials bridged into the environment?");
  process.exit(1);
}

const summary = await db.summarise();
console.log("✓ seeded\n");
for (const [slug, counts] of Object.entries(summary)) {
  const parts = Object.entries(counts)
    .map(([type, n]) => `${type.toLowerCase()} ${n}`)
    .join(", ");
  console.log(`  ${slug.padEnd(12)} ${parts}`);
}
