import { describe, expect, it } from "vitest";
import { safeNextPath, signInPathFor, UNAUTHORIZED_MESSAGE, unauthorized } from "@/lib/auth-guard";

describe("safeNextPath", () => {
  it("keeps an ordinary same-site path, query and all", () => {
    expect(safeNextPath("/packs")).toBe("/packs");
    expect(safeNextPath("/packs/cmu2qdlry000004kwpuii81g5/print")).toBe(
      "/packs/cmu2qdlry000004kwpuii81g5/print"
    );
    expect(safeNextPath("/create?brief=hello")).toBe("/create?brief=hello");
  });

  it("refuses anything that could leave the site", () => {
    // `//evil.test` is protocol-relative and `/\evil.test` is normalised into
    // it by some browsers — both are open redirects if a path check only
    // asks "does it start with a slash".
    for (const hostile of [
      "https://evil.test",
      "http://evil.test",
      "//evil.test",
      "//evil.test/packs",
      "/\\evil.test",
      "javascript:alert(1)",
      "packs",
      "",
    ]) {
      expect(safeNextPath(hostile), hostile).toBe("/packs");
    }
  });

  it("falls back for null and undefined", () => {
    expect(safeNextPath(null)).toBe("/packs");
    expect(safeNextPath(undefined)).toBe("/packs");
    expect(safeNextPath(undefined, "/create")).toBe("/create");
  });
});

describe("signInPathFor", () => {
  it("encodes the destination so a query string survives the round trip", () => {
    expect(signInPathFor("/packs")).toBe("/sign-in?next=%2Fpacks");
    const url = new URL(`http://localhost${signInPathFor("/create?brief=a&b=c")}`);
    expect(url.searchParams.get("next")).toBe("/create?brief=a&b=c");
  });
});

describe("unauthorized", () => {
  it("is a 401 carrying a marker the client can branch on", async () => {
    const res = unauthorized();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: UNAUTHORIZED_MESSAGE, signInRequired: true });
  });
});
