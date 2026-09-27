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

  it("refuses the reported payload: a tab that a browser strips into `//`", () => {
    // /sign-in?next=%2F%09%2Fevil.com — the L1 report. Decoded it is
    // "/<TAB>/evil.com", which starts with a single slash and so is neither
    // "//" nor "/\\": every prefix check passed it. The URL parser then strips
    // the tab (it strips tab, LF and CR anywhere in a URL, per WHATWG) leaving
    // "//evil.com", which is protocol-relative and off-site.
    expect(safeNextPath("/\t/evil.com")).toBe("/packs");
    expect(safeNextPath("/\n/evil.com")).toBe("/packs");
    expect(safeNextPath("/\r/evil.com")).toBe("/packs");

    // The same trick with the separator the parser also folds into a slash.
    expect(safeNextPath("/\t\\evil.com")).toBe("/packs");

    // And what the query string actually carries, decoded exactly as
    // URLSearchParams would hand it over.
    expect(safeNextPath(new URLSearchParams("next=%2F%09%2Fevil.com").get("next"))).toBe("/packs");
  });

  it("refuses every other control character too", () => {
    // Never legitimate in a redirect target, and a CR or LF in one is
    // header-injection shaped, so they are rejected before any parsing.
    for (const code of [0x00, 0x01, 0x08, 0x0b, 0x0c, 0x1f, 0x7f]) {
      const hostile = `/packs${String.fromCharCode(code)}/evil.com`;
      expect(safeNextPath(hostile), JSON.stringify(hostile)).toBe("/packs");
    }
  });

  it("agrees with a URL parser about what stays on the site", () => {
    // The deciding check is no longer a prefix test. Anything that resolves off
    // a placeholder origin is refused, whatever it is spelled with — so a new
    // trick does not need a new prefix rule to be caught.
    const PROBE = "https://next.invalid";
    for (const candidate of ["/packs", "/create?brief=hello", "/a/../../b", "/packs#top"]) {
      const staysPut = new URL(candidate, PROBE).origin === PROBE;
      expect(staysPut, candidate).toBe(true);
      expect(safeNextPath(candidate), candidate).toBe(candidate);
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
