#!/usr/bin/env node
/**
 * Gate that runs before anything leaves for AWS.
 *
 * The point is not that the generator might emit the wrong `origin` today —
 * it is that a hand-edited fixture, a merged branch, or a future generator
 * change might, and simulated data reaching a measurement path is the one
 * failure this repo has already committed to preventing (technical plan §11).
 * So the check lives on the upload path, not in a test suite someone can skip.
 *
 *   node fixtures/verify.mjs [--out DIR]
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Mirrors MEASURABLE_ORIGINS in packages/shared-types — duplicated, not imported,
 *  so deleting this directory cannot break the workspace and vice versa. */
const MEASURABLE_ORIGINS = new Set(["field", "self_measured"]);

/** No table, column, or derived view aggregates by individual worker (§4). */
const FORBIDDEN_KEYS = [
  "worker_id",
  "worker_productivity",
  "productivity_by_worker",
  "units_per_worker",
  "worker_rate",
  "crew_member_output",
];

let outDir = join(HERE, "out");
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  if (argv[i] === "--out") outDir = resolve(argv[i + 1] ?? "");
  else fail(`unknown flag ${argv[i]}`);
}

const problems = [];
function fail(message) {
  problems.push(message);
}

if (!existsSync(outDir)) {
  console.error(`fixtures: nothing generated at ${outDir} — run: node fixtures/generate.mjs`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
if (manifest.fixture?.origin !== "simulated" || manifest.fixture?.removable !== true) {
  fail("manifest.json does not declare this set as removable simulated data");
}

const dataDir = join(outDir, "data");
const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
let recordCount = 0;

for (const file of files) {
  const rows = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
  recordCount += rows.length;

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (FORBIDDEN_KEYS.includes(key)) {
        fail(`${file}: record ${row.id} carries worker-level field "${key}"`);
      }
    }
    if ("origin" in row && !isSimulated(row.origin)) {
      fail(`${file}: record ${row.id} has origin "${row.origin}" — fixtures must be "simulated"`);
    }
  }
}

function isSimulated(origin) {
  if (MEASURABLE_ORIGINS.has(origin)) return false;
  return origin === "simulated";
}

// Every capture must state an origin at all — an absent one is not a pass.
const captures = JSON.parse(readFileSync(join(dataDir, "captures.json"), "utf8"));
for (const capture of captures) {
  if (!("origin" in capture)) fail(`captures.json: ${capture.id} has no origin field`);
  if (!capture.media_ref) fail(`captures.json: ${capture.id} has no media_ref`);
  else if (!existsSync(join(outDir, capture.media_ref))) {
    fail(`captures.json: ${capture.id} references missing media ${capture.media_ref}`);
  }
}

if (problems.length > 0) {
  console.error("fixtures: verification FAILED — nothing should be uploaded\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(
  `fixtures: verified ${recordCount} records across ${files.length} files — all simulated, no worker-level fields`,
);
