/**
 * The backend contract, and the two rules that are about safety rather than about
 * storage: a key may not escape the store, and jobsite media may not leave Canada.
 *
 * The S3 backend is not exercised here — a test that needs credentials is a test
 * that gets skipped. What is tested is everything that can be got wrong without a
 * network: URI parsing, key containment, the region guard, and the round trip the
 * filesystem backend has to satisfy for the store to work at all.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { assertSafeKey, fsBackend, parseS3Uri, s3Backend } from "./blobs.js";

const root = mkdtempSync(join(tmpdir(), "sitewireai-trainer-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("fsBackend", () => {
  const backend = fsBackend(root);

  it("round-trips bytes", async () => {
    await backend.put("samples/abc.json", Buffer.from('{"id":"abc"}'), "application/json");
    const read = await backend.get("samples/abc.json");
    expect(read?.toString("utf8")).toBe('{"id":"abc"}');
  });

  it("returns null for a key that is not there", async () => {
    expect(await backend.get("samples/nothing.json")).toBeNull();
  });

  it("lists keys under a prefix, not paths", async () => {
    await backend.put("images/one.jpg", Buffer.from([1, 2, 3]), "image/jpeg");
    expect(await backend.list("images/")).toEqual(["images/one.jpg"]);
  });

  it("lists nothing for a prefix that does not exist yet", async () => {
    expect(await backend.list("exports/")).toEqual([]);
  });

  it("removes", async () => {
    await backend.put("samples/gone.json", Buffer.from("{}"), "application/json");
    await backend.remove("samples/gone.json");
    expect(await backend.get("samples/gone.json")).toBeNull();
  });

  it("removing something absent is not an error", async () => {
    await expect(backend.remove("samples/never-existed.json")).resolves.toBeUndefined();
  });

  it("refuses a key that would escape the store", async () => {
    await expect(backend.get("../../etc/passwd")).rejects.toThrow();
    await expect(backend.get("samples/../../outside.json")).rejects.toThrow();
  });
});

describe("assertSafeKey", () => {
  it("accepts the keys the app actually generates", () => {
    for (const key of [
      "samples/11111111-1111-4111-8111-111111111111.json",
      "images/11111111-1111-4111-8111-111111111111.jpg",
      "exports/cut-2026-08-25T00-00-00-000Z/DATASET_CARD.md",
    ]) {
      expect(() => assertSafeKey(key)).not.toThrow();
    }
  });

  it("rejects traversal, absolute paths and backslashes", () => {
    for (const key of ["../x", "a/../../b", "/etc/passwd", "images\\..\\x.jpg", ""]) {
      expect(() => assertSafeKey(key)).toThrow();
    }
  });
});

describe("parseS3Uri", () => {
  it("reads a bucket with no prefix", () => {
    expect(parseS3Uri("s3://sitewireai-dev-corpus", "ca-central-1")).toEqual({
      bucket: "sitewireai-dev-corpus",
      prefix: "",
      region: "ca-central-1",
    });
  });

  it("normalises a prefix to a single trailing slash", () => {
    expect(parseS3Uri("s3://bucket/corpus/", "ca-central-1")?.prefix).toBe("corpus/");
    expect(parseS3Uri("s3://bucket/corpus", "ca-central-1")?.prefix).toBe("corpus/");
    expect(parseS3Uri("s3://bucket/a/b//", "ca-central-1")?.prefix).toBe("a/b/");
  });

  it("returns null for anything that is not an s3 URI", () => {
    for (const uri of ["D:/corpus", "https://example.com/x", "s3://", "s3:///prefix"]) {
      expect(parseS3Uri(uri, "ca-central-1")).toBeNull();
    }
  });
});

describe("residency guard", () => {
  it("refuses to put jobsite media outside Canada", () => {
    // Business plan §4.3 makes residency contractual. An ambient AWS_REGION picked
    // up from a shell is exactly how media ends up in the wrong country.
    expect(() => s3Backend({ bucket: "b", prefix: "", region: "us-east-1" })).toThrow(
      /Canadian residency is contractual/,
    );
  });

  it("allows a Canadian region", () => {
    expect(() => s3Backend({ bucket: "b", prefix: "", region: "ca-central-1" })).not.toThrow();
  });
});
