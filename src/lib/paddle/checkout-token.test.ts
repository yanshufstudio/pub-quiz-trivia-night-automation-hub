import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CHECKOUT_SIGNATURE_TTL_MS,
  CheckoutSigningError,
  signCreatorId,
  verifiedCreatorId,
} from "./checkout-token";

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

/**
 * The signature expires (L11).
 *
 * It used to be valid for ever, which made a leaked one — from a shared browser, a
 * screenshot of a network panel, a proxy log — a permanent capability to point a
 * subscription at that account. Only the *first* event for a subscription consults
 * customData at all, and that arrives within seconds of checkout, so an expiry
 * costs nothing that matters.
 */
describe("signature expiry", () => {
  const SIGNED_AT = Date.UTC(2026, 8, 27, 12, 0, 0);
  const signed = (creatorId = "creator_a", at = SIGNED_AT) => ({
    creatorId,
    creatorSig: signCreatorId(creatorId, SECRET, at),
  });

  it("accepts a fresh signature", () => {
    expect(verifiedCreatorId(signed(), SECRET, SIGNED_AT + 1000)).toBe("creator_a");
  });

  it("still accepts one right up to the limit", () => {
    // Paddle retries a failed delivery for three days, so a first event held up
    // by an outage at either end must still be able to bind its subscription. The
    // window is a week for exactly that reason.
    expect(CHECKOUT_SIGNATURE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(CHECKOUT_SIGNATURE_TTL_MS).toBeGreaterThan(3 * 24 * 60 * 60 * 1000);
    expect(verifiedCreatorId(signed(), SECRET, SIGNED_AT + CHECKOUT_SIGNATURE_TTL_MS)).toBe("creator_a");
  });

  it("refuses one a millisecond past it", () => {
    expect(verifiedCreatorId(signed(), SECRET, SIGNED_AT + CHECKOUT_SIGNATURE_TTL_MS + 1)).toBeNull();
  });

  it("refuses one dated in the future", () => {
    // A clock problem or a crafted value; either way not something to trust.
    expect(verifiedCreatorId(signed(), SECRET, SIGNED_AT - 1)).toBeNull();
  });

  it("refuses an edited timestamp, because the MAC covers it", () => {
    /**
     * The obvious attack on an expiry carried alongside its own signature: take an
     * old signature and move its date forward.
     *
     * The forged date is deliberately still in the *past* at the moment of
     * checking, and comfortably inside the window. An earlier version of this test
     * used a far-future date, which the future-date guard refused — so it passed
     * with the timestamp left out of the MAC entirely, and proved nothing about
     * the MAC. Mutation testing is how that was found.
     */
    const { creatorId, creatorSig } = signed();
    const mac = creatorSig.slice(creatorSig.indexOf(".") + 1);
    const checkedAt = SIGNED_AT + 30 * 24 * 60 * 60 * 1000; // long expired
    const forgedIssuedAt = checkedAt - 60_000; // a minute ago: past, and fresh

    const extended = { creatorId, creatorSig: `${forgedIssuedAt}.${mac}` };
    expect(verifiedCreatorId(extended, SECRET, checkedAt)).toBeNull();

    // And the untouched signature really is expired by then, so the assertion
    // above is about the forgery rather than about the clock.
    expect(verifiedCreatorId(signed(), SECRET, checkedAt)).toBeNull();
  });

  it("refuses a signature with no timestamp at all", () => {
    // The pre-L11 shape. Refused rather than grandfathered: accepting the
    // un-expiring form for ever would be the same as having no expiry.
    const legacy = createHmac("sha256", createHmac("sha256", SECRET).update("triviafoundry:paddle-checkout:v1").digest())
      .update("creator_a")
      .digest("base64url");
    expect(verifiedCreatorId({ creatorId: "creator_a", creatorSig: legacy }, SECRET, SIGNED_AT)).toBeNull();
  });

  it("refuses a malformed timestamp without throwing", () => {
    // customData comes from Paddle, which got it from a browser.
    for (const sig of [".abc", "abc.abc", "-1.abc", "1e9.abc", `${SIGNED_AT}.`, "."]) {
      expect(
        verifiedCreatorId({ creatorId: "creator_a", creatorSig: sig }, SECRET, SIGNED_AT),
        sig
      ).toBeNull();
    }
  });

  it("still refuses a signature for a different creator, whatever its age", () => {
    // The original guarantee, unchanged by the expiry.
    const { creatorSig } = signed("creator_a");
    expect(verifiedCreatorId({ creatorId: "creator_b", creatorSig }, SECRET, SIGNED_AT + 1000)).toBeNull();
  });
});
