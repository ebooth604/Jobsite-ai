import { describe, expect, it } from "vitest";
import { type CaptureOrigin, isMeasurableOrigin } from "./index.js";

describe("isMeasurableOrigin", () => {
  it("admits captures taken in the field", () => {
    expect(isMeasurableOrigin("field")).toBe(true);
  });

  it("admits self-measured captures, the primary held-out set", () => {
    expect(isMeasurableOrigin("self_measured")).toBe(true);
  });

  it("rejects simulated captures — they may train a model, never measure one", () => {
    const origin: CaptureOrigin = "simulated";
    expect(isMeasurableOrigin(origin)).toBe(false);
  });
});
