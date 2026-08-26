/**
 * Credential resolution, which is mostly about *not* interfering.
 *
 * This mechanism exists for one local workflow: an `aws login` session the SDK
 * cannot read. Every other way of getting credentials — static keys, an instance
 * role, hand-bridged environment variables — already works, and the failure mode
 * worth testing for is this module breaking one of them by being too eager.
 */

import { describe, expect, it } from "vitest";
import { credentialProfile, sdkCredentials } from "./credentials.js";

describe("credentialProfile", () => {
  it("prefers the app's own setting over the ambient one", () => {
    // A shell with AWS_PROFILE set for something else should not silently
    // redirect the trainer at that account.
    expect(credentialProfile({ SITEWIREAI_AWS_PROFILE: "sitewire", AWS_PROFILE: "other" })).toBe(
      "sitewire",
    );
  });

  it("falls back to AWS_PROFILE", () => {
    expect(credentialProfile({ AWS_PROFILE: "sitewire" })).toBe("sitewire");
  });

  it("is empty when nothing is configured", () => {
    expect(credentialProfile({})).toBe("");
  });
});

describe("sdkCredentials", () => {
  it("stays out of the way when no profile is set", () => {
    // The SDK's own chain handles instance roles and static keys. Overriding it
    // here would break deployment to serve a laptop.
    expect(sdkCredentials({})).toEqual({});
  });

  it("stays out of the way when credentials are already bridged", () => {
    // Someone who ran the eval bridge by hand meant it. Shelling out underneath
    // them would ignore a deliberate choice.
    expect(
      sdkCredentials({
        SITEWIREAI_AWS_PROFILE: "sitewire",
        AWS_ACCESS_KEY_ID: "AKIA...",
        AWS_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual({});
  });

  it("supplies a refreshing provider when only a profile is set", () => {
    const resolved = sdkCredentials({ SITEWIREAI_AWS_PROFILE: "sitewire" });
    expect("credentials" in resolved).toBe(true);
    // A function, not a value: the SDK re-invokes it once the expiry passes,
    // which is the entire point — an `aws login` token lasts fifteen minutes.
    expect(typeof (resolved as { credentials: unknown }).credentials).toBe("function");
  });

  it("ignores a half-bridged environment", () => {
    // An access key with no secret is a broken shell, not a deliberate setup.
    const resolved = sdkCredentials({
      SITEWIREAI_AWS_PROFILE: "sitewire",
      AWS_ACCESS_KEY_ID: "AKIA...",
    });
    expect("credentials" in resolved).toBe(true);
  });
});
