import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CheckoutSigningError, signCreatorId, verifiedCreatorId } from "./checkout-token";

const SECRET = "a-better-auth-secret-for-tests";

describe("checkout customData signing", () => {
  it("round-trips: the id it signed is the id it verifies", () => {
    const creatorSig = signCreatorId("creator_a", SECRET);
    expect(verifiedCreatorId({ creatorId: "creator_a", creatorSig }, SECRET)).toBe("creator_a");
  });

  it("refuses an id edited in the browser, keeping the original signature", () => {
    // The attack PR #4 was open to: point a subscription at someone else's
    // account by changing the id on its way to Paddle.
    const creatorSig = signCreatorId("creator_a", SECRET);
    expect(verifiedCreatorId({ creatorId: "creator_b", creatorSig }, SECRET)).toBeNull();
  });

  it("refuses a signature made with another deployment's secret", () => {
    // A sandbox checkout signed on a preview must not verify on production.
    const creatorSig = signCreatorId("creator_a", "the-preview-secret");
    expect(verifiedCreatorId({ creatorId: "creator_a", creatorSig }, SECRET)).toBeNull();
  });

  it("refuses a missing, empty or non-string signature or id, without throwing", () => {
    const good = signCreatorId("creator_a", SECRET);
    for (const customData of [
      null,
      undefined,
      {},
      { creatorId: "creator_a" },
      { creatorSig: good },
      { creatorId: "", creatorSig: good },
      { creatorId: "creator_a", creatorSig: "" },
      { creatorId: "creator_a", creatorSig: 42 },
      { creatorId: ["creator_a"], creatorSig: good },
      { creatorId: "creator_a", creatorSig: `${good}x` },
    ]) {
      expect(verifiedCreatorId(customData as Record<string, unknown> | null, SECRET), JSON.stringify(customData)).toBeNull();
    }
  });

  it("verifies nothing when no secret is configured", () => {
    const creatorSig = signCreatorId("creator_a", SECRET);
    expect(verifiedCreatorId({ creatorId: "creator_a", creatorSig }, undefined)).toBeNull();
    expect(verifiedCreatorId({ creatorId: "creator_a", creatorSig }, "")).toBeNull();
  });

  it("refuses to sign without a secret rather than signing with nothing", () => {
    expect(() => signCreatorId("creator_a", undefined)).toThrow(CheckoutSigningError);
    expect(() => signCreatorId("creator_a", "")).toThrow(CheckoutSigningError);
  });

  it("does not sign with the secret itself, so its signatures live in their own domain", () => {
    // A plain HMAC(secret, id) is the shape Better Auth uses for its own
    // signed values. The derived key keeps a checkout signature from ever
    // being mistaken for one of those, or the reverse.
    const plain = createHmac("sha256", SECRET).update("creator_a").digest("base64url");
    expect(signCreatorId("creator_a", SECRET)).not.toBe(plain);
  });
});
