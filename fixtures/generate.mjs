#!/usr/bin/env node

/**
 * Generates the removable simulated fixture set.
 *
 * Everything this writes is synthetic. Every Capture it emits carries
 * `origin: "simulated"`, which under technical plan §5.4d and §11 means the
 * data may train a model and may never measure one. Nothing here is field
 * data, and nothing here may back an accuracy figure.
 *
 * Output is deterministic — same seed, byte-identical bytes — so re-running
 * before an upload leaves `aws s3 sync` with nothing to do.
 *
 * Zero dependencies on purpose: the fixture set must not be a workspace
 * member, or deleting it would break `pnpm install`.
 *
 *   node fixtures/generate.mjs [--seed N] [--projects N] [--out DIR]
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Fixed clock. Real timestamps would make output non-deterministic. */
const EPOCH = Date.UTC(2026, 7, 3); // Mon 2026-08-03
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------- arguments

function parseArgs(argv) {
  const opts = { seed: 20260803, projects: 2, out: join(HERE, "out") };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`missing value for ${flag}`);
    if (flag === "--seed") opts.seed = Number(value);
    else if (flag === "--projects") opts.projects = Number(value);
    else if (flag === "--out") opts.out = resolve(value);
    else throw new Error(`unknown flag ${flag}`);
  }
  if (!Number.isInteger(opts.projects) || opts.projects < 1) {
    throw new Error("--projects must be a positive integer");
  }
  return opts;
}

// ------------------------------------------------------------------- random

/** mulberry32 — small, seedable, and identical across Node versions. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
const between = (rng, lo, hi) => lo + rng() * (hi - lo);
const round = (n, dp = 2) => Number(n.toFixed(dp));
const isoDate = (dayOffset) => new Date(EPOCH + dayOffset * DAY_MS).toISOString();

// -------------------------------------------------------------- png writing

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, tail]);
}

/**
 * A tiny placeholder PNG — banded colour, no scene content.
 *
 * These stand in for jobsite media so the ingestion path has real bytes with
 * real content-types to move. They are not renders and carry no ground truth;
 * the manifest's quantities are the fixture's only "truth", and it is
 * synthetic truth. No faces, so the face-blur gate (technical plan §4) has
 * nothing to act on — which is why `face_blur_status` reads
 * `no_faces_synthetic` rather than claiming a blur pass that never ran.
 */
function placeholderPng(rng, size = 64) {
  const base = [
    Math.floor(between(rng, 40, 200)),
    Math.floor(between(rng, 40, 200)),
    Math.floor(between(rng, 40, 200)),
  ];
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter: none
    const shade = 0.6 + 0.4 * (Math.floor(y / 8) / (size / 8));
    for (let x = 0; x < size; x++) {
      raw[offset++] = Math.min(255, Math.floor(base[0] * shade));
      raw[offset++] = Math.min(255, Math.floor(base[1] * shade));
      raw[offset++] = Math.min(255, Math.floor(base[2] * shade));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- fixture data

const TRADES = ["electrical_rough_in", "concrete_forming"];

/** Scope items per trade, mirroring technical plan §5.1 — two trades, tracked apart. */
const SCOPE_TEMPLATES = {
  electrical_rough_in: [
    { description: "3/4in EMT conduit run", unit_of_measure: "m", rate: 6.5 },
    { description: "Device box rough-in", unit_of_measure: "ea", rate: 4.0 },
    { description: "Panel feeder pull", unit_of_measure: "m", rate: 3.2 },
  ],
  concrete_forming: [
    { description: "Wall formwork, contact area", unit_of_measure: "m2", rate: 2.4 },
    { description: "Column formwork", unit_of_measure: "ea", rate: 0.8 },
  ],
};

const AREAS = ["L2-north", "L2-south", "L3-core", "P1-east"];
const CITIES = [
  { name: "Vancouver", province: "BC", lat: 49.2827, lon: -123.1207 },
  { name: "Burnaby", province: "BC", lat: 49.2488, lon: -122.9805 },
  { name: "Surrey", province: "BC", lat: 49.1913, lon: -122.849 },
];

function build(opts) {
  const rng = makeRandom(opts.seed);
  const pad = (n, width = 3) => String(n).padStart(width, "0");

  const organizations = [
    {
      id: "org_sim_0001",
      legal_name: "Simulated Trades Ltd. (FIXTURE — not a real firm)",
      province: "BC",
      trades: TRADES,
      data_region: "ca-central-1",
    },
  ];

  const projects = [];
  const scopeItems = [];
  const captures = [];
  const quantityEstimates = [];
  const corrections = [];
  const labourHours = [];
  const productivityFactors = [];
  const media = [];

  for (let p = 1; p <= opts.projects; p++) {
    const city = pick(rng, CITIES);
    const trade = TRADES[(p - 1) % TRADES.length];
    const projectId = `proj_sim_${pad(p)}`;

    projects.push({
      id: projectId,
      org_id: organizations[0].id,
      name: `Fixture Site ${pad(p)} — ${city.name}`,
      address: `${100 + p} Simulated Way, ${city.name}, ${city.province}`,
      geolocation: {
        lat: round(city.lat + between(rng, -0.02, 0.02), 5),
        lon: round(city.lon + between(rng, -0.02, 0.02), 5),
      },
      status: "active",
      start_date: isoDate(-30),
    });

    SCOPE_TEMPLATES[trade].forEach((tpl, s) => {
      const scopeItemId = `scope_sim_${pad(p)}_${pad(s + 1, 2)}`;
      const bidQuantity = round(between(rng, 200, 900), 1);
      const bidHours = round(bidQuantity / tpl.rate, 1);

      scopeItems.push({
        id: scopeItemId,
        project_id: projectId,
        trade,
        description: tpl.description,
        unit_of_measure: tpl.unit_of_measure,
        bid_quantity: bidQuantity,
        bid_hours: bidHours,
        budgeted_units_per_hour: tpl.rate,
      });

      let installedToDate = 0;

      for (let d = 0; d < 5; d++) {
        const captureId = `cap_sim_${pad(p)}_${pad(s + 1, 2)}_${pad(d + 1, 2)}`;
        const mediaKey = `media/${captureId}.png`;

        media.push({ key: mediaKey, bytes: placeholderPng(rng) });

        captures.push({
          id: captureId,
          project_id: projectId,
          area: pick(rng, AREAS),
          captured_at: isoDate(d),
          // Provenance/audit only. Never surfaced as a performance metric —
          // technical plan §4, and the schema constraint that follows it.
          captured_by: `user_sim_foreman_${pad((p % 2) + 1, 2)}`,
          geolocation: { lat: round(city.lat, 5), lon: round(city.lon, 5) },
          media_ref: mediaKey,
          face_blur_status: "no_faces_synthetic",
          origin: "simulated",
        });

        // Abstain on a minority of captures so the abstention path has traffic.
        const abstained = rng() < 0.2;
        const confidence = abstained
          ? round(between(rng, 0.3, 0.58))
          : round(between(rng, 0.72, 0.96));
        const dayQuantity = round(between(rng, 0.08, 0.16) * scopeItems.at(-1).bid_quantity, 1);
        const estimateId = `qest_sim_${pad(p)}_${pad(s + 1, 2)}_${pad(d + 1, 2)}`;

        quantityEstimates.push({
          id: estimateId,
          capture_id: captureId,
          scope_item_id: scopeItemId,
          estimated_quantity: abstained ? null : dayQuantity,
          confidence,
          abstained,
          model_version: "fixture-sim-0",
          // Stated on every fixture estimate for the same reason §5.4d requires
          // it on every real accuracy report: the mix is part of the number.
          synthetic_training_share: 1.0,
        });

        // Foreman correction — the training signal (§4).
        const corrected = !abstained && rng() < 0.35;
        const installedThisDay = corrected
          ? round(dayQuantity * between(rng, 0.85, 1.15), 1)
          : abstained
            ? round(between(rng, 0.05, 0.12) * scopeItems.at(-1).bid_quantity, 1)
            : dayQuantity;

        if (corrected) {
          corrections.push({
            id: `corr_sim_${pad(p)}_${pad(s + 1, 2)}_${pad(d + 1, 2)}`,
            quantity_estimate_id: estimateId,
            corrected_quantity: installedThisDay,
            corrected_by: `user_sim_foreman_${pad((p % 2) + 1, 2)}`,
            corrected_at: isoDate(d),
          });
        }

        installedToDate = round(installedToDate + installedThisDay, 1);
        const hours = round(installedThisDay / (tpl.rate * between(rng, 0.75, 1.2)), 1);

        labourHours.push({
          id: `hours_sim_${pad(p)}_${pad(s + 1, 2)}_${pad(d + 1, 2)}`,
          project_id: projectId,
          scope_item_id: scopeItemId,
          date: isoDate(d).slice(0, 10),
          hours,
          source_system: "fixture",
          normalization_flags: [],
        });

        const actualRate = round(installedThisDay / hours, 2);
        productivityFactors.push({
          id: `pf_sim_${pad(p)}_${pad(s + 1, 2)}_${pad(d + 1, 2)}`,
          project_id: projectId,
          scope_item_id: scopeItemId,
          date: isoDate(d).slice(0, 10),
          installed_quantity: installedThisDay,
          hours,
          budgeted_rate: tpl.rate,
          actual_rate: actualRate,
          factor: round(actualRate / tpl.rate, 2),
        });
      }
    });
  }

  return {
    entities: {
      organizations,
      projects,
      scope_items: scopeItems,
      captures,
      quantity_estimates: quantityEstimates,
      corrections,
      labour_hours_records: labourHours,
      productivity_factors: productivityFactors,
    },
    media,
  };
}

// -------------------------------------------------------------------- write

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { entities, media } = build(opts);

  rmSync(opts.out, { recursive: true, force: true });
  mkdirSync(join(opts.out, "data"), { recursive: true });
  mkdirSync(join(opts.out, "media"), { recursive: true });

  for (const [name, rows] of Object.entries(entities)) {
    writeFileSync(join(opts.out, "data", `${name}.json`), `${JSON.stringify(rows, null, 2)}\n`);
  }
  for (const { key, bytes } of media) {
    writeFileSync(join(opts.out, key), bytes);
  }

  const manifest = {
    fixture: {
      removable: true,
      origin: "simulated",
      seed: opts.seed,
      generated_by: "fixtures/generate.mjs",
      constraint:
        "Simulated data may train a model and may never measure one. No accuracy figure, internal or customer-facing, may rest on these records. Technical plan §5.4d and §11.",
      teardown: "rm -rf fixtures/out && fixtures/teardown-s3.sh",
    },
    counts: Object.fromEntries(Object.entries(entities).map(([name, rows]) => [name, rows.length])),
    media_files: media.length,
  };
  writeFileSync(join(opts.out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const total = Object.values(manifest.counts).reduce((a, b) => a + b, 0);
  console.log(`fixtures: wrote ${total} records and ${media.length} media files to ${opts.out}`);
  for (const [name, count] of Object.entries(manifest.counts)) {
    console.log(`  ${name.padEnd(24)} ${count}`);
  }
}

main();
