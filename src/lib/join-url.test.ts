import { describe, expect, it } from "vitest";
import { buildJoinUrl, buildHostUrl, readJoinCode } from "@/lib/join-url";

describe("buildJoinUrl", () => {
  it("points at /play with the session code as a query parameter", () => {
    expect(buildJoinUrl("https://quiz.example", "AB3K7")).toBe("https://quiz.example/play?code=AB3K7");
  });

  it("tolerates a trailing slash on the origin", () => {
    expect(buildJoinUrl("https://quiz.example/", "AB3K7")).toBe("https://quiz.example/play?code=AB3K7");
  });
});

describe("readJoinCode", () => {
  it("returns the code from a ?code= query string, uppercased", () => {
    expect(readJoinCode("?code=ab3k7")).toBe("AB3K7");
  });

  it("returns an empty string when the parameter is missing", () => {
    expect(readJoinCode("")).toBe("");
    expect(readJoinCode("?other=1")).toBe("");
  });

  it("strips characters outside the join-code alphabet and caps at five", () => {
    // Mirrors the input's own sanitising so a mangled or padded link can't
    // prefill something the form would never accept.
    expect(readJoinCode("?code=a-b3k7xx")).toBe("AB3K7");
    expect(readJoinCode("?code=01IO")).toBe("");
  });
});

describe("buildHostUrl", () => {
  it("points at the host desk for the code, uppercased", () => {
    expect(buildHostUrl("https://triviafoundry.com", "ab7kq")).toBe("https://triviafoundry.com/host/AB7KQ");
  });

  it("does not put the host key in the URL", () => {
    // The key is a credential. A URL lands in history, in referrers and in any
    // log that records a path, so the link the host desk offers for copying
    // carries the code and nothing else — the creator who started the game gets
    // their key from the server instead.
    const url = buildHostUrl("https://triviafoundry.com", "AB7KQ");
    expect(url).not.toMatch(/key|token|\?/);
  });

  it("tolerates a trailing slash on the origin, like buildJoinUrl", () => {
    expect(buildHostUrl("http://localhost:4517/", "AB7KQ")).toBe("http://localhost:4517/host/AB7KQ");
  });
});
