import { describe, expect, it } from "vitest";
import {
  MEDIA_HOST_TOKEN_PARAM,
  MEDIA_SESSION_CODE_PARAM,
  MEDIA_TEAM_TOKEN_PARAM,
  questionMediaUrl,
} from "@/lib/question-media-url";

/**
 * The client half of the media gate. It is a string builder, which is why it
 * is worth a test at all: the server reads these exact parameter names, and
 * the two halves agreeing is the difference between a quiz with pictures and
 * a quiz with broken image icons.
 */
describe("questionMediaUrl", () => {
  it("is a bare path for the surfaces that carry a session cookie", () => {
    expect(questionMediaUrl("q1")).toBe("/api/questions/q1/media");
    expect(questionMediaUrl("q1", null)).toBe("/api/questions/q1/media");
  });

  it("carries the join code and the team's token", () => {
    const url = new URL(questionMediaUrl("q1", { code: "QUIZ42", token: "t0ken" }), "https://x.test");
    expect(url.searchParams.get(MEDIA_SESSION_CODE_PARAM)).toBe("QUIZ42");
    expect(url.searchParams.get(MEDIA_TEAM_TOKEN_PARAM)).toBe("t0ken");
    expect(url.searchParams.get(MEDIA_HOST_TOKEN_PARAM)).toBeNull();
  });

  it("carries the host key for the desk, and no team token", () => {
    const url = new URL(questionMediaUrl("q1", { code: "QUIZ42", hostToken: "hk" }), "https://x.test");
    expect(url.searchParams.get(MEDIA_HOST_TOKEN_PARAM)).toBe("hk");
    expect(url.searchParams.get(MEDIA_TEAM_TOKEN_PARAM)).toBeNull();
  });

  it("escapes everything it is given", () => {
    // A token is opaque and a question id is a cuid, but neither is this
    // function's to assume — one unescaped `&` would silently truncate the
    // credential and produce a 404 nobody could explain.
    const url = questionMediaUrl("a/b?c", { code: "Q&A", token: "to ken&code=X" });
    expect(url).toContain("/api/questions/a%2Fb%3Fc/media");
    const parsed = new URL(url, "https://x.test");
    expect(parsed.searchParams.get(MEDIA_SESSION_CODE_PARAM)).toBe("Q&A");
    expect(parsed.searchParams.get(MEDIA_TEAM_TOKEN_PARAM)).toBe("to ken&code=X");
  });
});
