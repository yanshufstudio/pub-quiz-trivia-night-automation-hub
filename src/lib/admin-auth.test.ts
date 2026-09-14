import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isAdminTokenConfigured, isAuthorizedAdmin } from "@/lib/admin-auth";

function requestWith(token: string | null) {
  return new NextRequest("http://localhost/api/x", {
    headers: token ? { "x-admin-token": token } : {},
  });
}

describe("isAuthorizedAdmin", () => {
  const originalToken = process.env.ADMIN_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalToken;
  });

  // Fails closed: no configured token means no operator, so no request is
  // the operator — including one that supplies a header of its own. The
  // helper must be safe on its own, not only when a caller remembers to
  // check isAdminTokenConfigured() first.
  it("authorizes nobody when ADMIN_TOKEN is unset", () => {
    delete process.env.ADMIN_TOKEN;
    expect(isAuthorizedAdmin(requestWith(null))).toBe(false);
    expect(isAuthorizedAdmin(requestWith("anything"))).toBe(false);
    expect(isAuthorizedAdmin(requestWith(""))).toBe(false);
  });

  it("authorizes nobody when ADMIN_TOKEN is set to an empty string", () => {
    process.env.ADMIN_TOKEN = "";
    expect(isAuthorizedAdmin(requestWith(""))).toBe(false);
    expect(isAuthorizedAdmin(requestWith("anything"))).toBe(false);
  });

  describe("when ADMIN_TOKEN is set", () => {
    beforeEach(() => {
      process.env.ADMIN_TOKEN = "correct-horse-battery-staple";
    });

    it("rejects a missing header", () => {
      expect(isAuthorizedAdmin(requestWith(null))).toBe(false);
    });

    it("rejects a wrong token", () => {
      expect(isAuthorizedAdmin(requestWith("wrong-token"))).toBe(false);
    });

    it("rejects a token of a different length (before the timing-safe compare)", () => {
      expect(isAuthorizedAdmin(requestWith("short"))).toBe(false);
    });

    it("accepts the exact configured token", () => {
      expect(isAuthorizedAdmin(requestWith("correct-horse-battery-staple"))).toBe(true);
    });
  });
});

describe("isAdminTokenConfigured", () => {
  const originalToken = process.env.ADMIN_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalToken;
  });

  it("is false when ADMIN_TOKEN is unset", () => {
    delete process.env.ADMIN_TOKEN;
    expect(isAdminTokenConfigured()).toBe(false);
  });

  it("is true once ADMIN_TOKEN is set, regardless of the request", () => {
    process.env.ADMIN_TOKEN = "correct-horse-battery-staple";
    expect(isAdminTokenConfigured()).toBe(true);
  });
});
