/**
 * The corpus store: an in-memory index over a blob backend.
 *
 * Sample metadata is small — a few kilobytes each, thousands at most — so the whole
 * set is read once at startup and held in memory, and every write goes through to
 * the backend immediately. That buys two things. Reads stay synchronous, so the
 * pages that render a library or compute coverage do not become async plumbing all
 * the way down. And with S3 behind it, drawing a page costs zero round trips rather
 * than one per sample, which is the difference between a usable tool and a
 * spinner.
 *
 * Images are not cached. They are large, and the pages that need them stream them
 * one at a time through the browser's own image loading. They are also write-once:
 * redaction is baked in before upload and nothing in this app rewrites those bytes,
 * so they can be served with a long immutable cache header without any risk of an
 * un-redacted frame surviving in a cache.
 *
 * The store never holds unredacted bytes at all — see `dataset.ts`.
 */

import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { backendFromEnv, type CorpusBackend } from "./blobs.js";
import type { TrainingSample } from "./dataset.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** `dist/` sits beside the app root, so the default corpus is `apps/trainer/data`. */
const DEFAULT_ROOT = resolve(HERE, "..", "data");

let backend: CorpusBackend | null = null;
const index = new Map<string, TrainingSample>();
const unreadable: string[] = [];

function active(): CorpusBackend {
  if (!backend) throw new Error("corpus store used before openStore() — this is a bug");
  return backend;
}

/**
 * Opens the corpus and loads the index. Called once, at startup, before the server
 * listens: a tool that starts serving before it knows what is in its own corpus
 * would answer its first few requests with an empty library.
 */
export async function openStore(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  backend = backendFromEnv(env, DEFAULT_ROOT);
  await reloadIndex();
}

/** Test seam: point the store at a specific backend without going via the env. */
export async function openStoreWith(chosen: CorpusBackend): Promise<void> {
  backend = chosen;
  await reloadIndex();
}

export async function reloadIndex(): Promise<void> {
  index.clear();
  unreadable.length = 0;

  const keys = await active().list("samples/");
  for (const key of keys) {
    if (!key.endsWith(".json")) continue;
    const bytes = await active().get(key);
    if (!bytes) continue;
    try {
      const sample = normalise(JSON.parse(bytes.toString("utf8")) as TrainingSample);
      if (typeof sample.id === "string" && sample.id) index.set(sample.id, sample);
      else unreadable.push(key);
    } catch {
      // One unparseable file must not blind the whole library. It stays where it
      // is and is reported on the integrity page rather than silently dropped.
      unreadable.push(key);
    }
  }
}

/**
 * Fills in fields added after a sample was written.
 *
 * The store is a plain directory that people are encouraged to hand-edit, and the
 * schema grows. A sample written before `chains` existed is not corrupt — it is a
 * sample from last month — and the alternative to filling defaults on read is
 * either a migration script nobody runs or an optional field every consumer has to
 * remember to guard.
 *
 * Read-time only: nothing is rewritten to disk until the sample is next saved, so
 * opening a corpus never silently rewrites a hundred files.
 */
function normalise(sample: TrainingSample): TrainingSample {
  return {
    ...sample,
    conditions: sample.conditions ?? [],
    chains: (sample.chains ?? []).map((chain) => ({
      ...chain,
      regionIds: chain.regionIds ?? [],
      // A chain from before the threshold existed was human-written by definition:
      // there was no model drafting them. Defaulting confidence to 0 would flag
      // every one of them as an unconfirmed low-confidence chain.
      modelConfidence: typeof chain.modelConfidence === "number" ? chain.modelConfidence : 1,
      autoAccepted: chain.autoAccepted ?? false,
    })),
    regions: (sample.regions ?? []).map((region) => ({
      ...region,
      proposedBy: region.proposedBy ?? "",
    })),
    hardCases: sample.hardCases ?? [],
    faceRedaction: {
      ...sample.faceRedaction,
      assistedBy: sample.faceRedaction?.assistedBy ?? "",
      // Absent means a human drew every rectangle, which is what happened before
      // the detector existed. Defaulting to false would retroactively accuse every
      // earlier sample of skipping a confirmation that was never required.
      confirmedByHuman: sample.faceRedaction?.confirmedByHuman ?? true,
    },
  };
}

export function storeLocation(): string {
  return backend ? backend.describe() : "(not open)";
}

/** True when the corpus is in S3 — used only to say so on screen. */
export function isRemote(): boolean {
  return storeLocation().startsWith("s3://");
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function extensionFor(mime: string): string | null {
  return MIME_EXTENSIONS[mime] ?? null;
}

export function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Newest first, which is the order every page wants. */
export function listSamples(): TrainingSample[] {
  return [...index.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getSample(id: string): TrainingSample | null {
  return index.get(id) ?? null;
}

/** Keys that failed to parse — surfaced on the integrity page, not swallowed. */
export function unreadableSamples(): string[] {
  return [...unreadable];
}

function sampleKey(id: string): string {
  if (!/^[a-z0-9-]{6,64}$/.test(id)) {
    throw new Error(`refusing to write a sample with an unusable id: ${id}`);
  }
  return `samples/${id}.json`;
}

export function imageKey(file: string): string | null {
  return /^[a-z0-9-]{6,64}\.(jpg|png|webp)$/.test(file) ? `images/${file}` : null;
}

export async function putSample(sample: TrainingSample): Promise<void> {
  const bytes = Buffer.from(`${JSON.stringify(sample, null, 2)}\n`, "utf8");
  await active().put(sampleKey(sample.id), bytes, "application/json");
  index.set(sample.id, sample);
}

/**
 * Deletes a sample and its image.
 *
 * The image goes too. A photo of a real jobsite with no metadata attached is worse
 * than useless — it is an orphaned picture of somebody's workplace that nothing in
 * the app will ever show you again.
 */
export async function deleteSample(id: string): Promise<boolean> {
  const sample = index.get(id);
  if (!sample) return false;
  await active().remove(sampleKey(id));
  const key = imageKey(sample.imageFile);
  if (key) await active().remove(key);
  index.delete(id);
  return true;
}

/** A photo already in the corpus, matched by content hash rather than by name. */
export function findByHash(hash: string): TrainingSample | null {
  return listSamples().find((s) => s.imageSha256 === hash) ?? null;
}

export interface StoredImage {
  file: string;
  sha256: string;
  bytes: number;
}

/**
 * Writes image bytes under a generated name.
 *
 * Duplicate detection is by content, not by file name: the same photo arrives twice
 * under different names routinely — once from the phone and once from a folder
 * somebody re-exported — and two copies of one wall in a training set is a quiet
 * way to overweight one wall.
 */
export async function writeImage(id: string, bytes: Buffer, mime: string): Promise<StoredImage> {
  const ext = extensionFor(mime);
  if (!ext) throw new Error(`unsupported image type: ${mime}`);
  const file = `${id}${ext}`;
  const key = imageKey(file);
  if (!key) throw new Error(`refusing to write an image with an unusable name: ${file}`);
  await active().put(key, bytes, mime);
  return { file, sha256: sha256(bytes), bytes: bytes.length };
}

export async function readImage(
  file: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  const key = imageKey(file);
  if (!key) return null;
  const body = await active().get(key);
  if (!body) return null;
  const ext = file.slice(file.lastIndexOf("."));
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { body, contentType };
}

/** Export artefacts go through the same backend, so a cut lands beside its corpus. */
export async function writeExportArtefact(
  key: string,
  bytes: Buffer,
  contentType: string,
): Promise<void> {
  await active().put(key, bytes, contentType);
}

export async function readRaw(key: string): Promise<Buffer | null> {
  return active().get(key);
}

export function newId(): string {
  return randomUUID();
}

/**
 * Images referenced by no sample, and samples referencing no image. Both are
 * recoverable mistakes, and both are invisible until something looks for them.
 */
export interface Orphans {
  imagesWithoutSample: string[];
  samplesWithoutImage: string[];
}

export async function findOrphans(): Promise<Orphans> {
  const samples = listSamples();
  const referenced = new Set(samples.map((s) => s.imageFile));
  const onDisk = (await active().list("images/"))
    .map((key) => key.slice("images/".length))
    .filter((file) => /\.(jpg|png|webp)$/.test(file));
  const present = new Set(onDisk);

  return {
    imagesWithoutSample: onDisk.filter((file) => !referenced.has(file)),
    samplesWithoutImage: samples.filter((s) => !present.has(s.imageFile)).map((s) => s.id),
  };
}
