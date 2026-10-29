import { describe, expect, it } from "vitest";
import { formatBytes, MAX_MEDIA_BYTES } from "./media-limits";

describe("formatBytes", () => {
  // A non-breaking space, so "2" and "MB" never land on two lines: the
  // homepage card, /how-it-works, /faq, the editor and the upload error all
  // print this.
  it("keeps the number and the unit together", () => {
    expect(formatBytes(MAX_MEDIA_BYTES)).toBe("2\xa0MB");
    expect(formatBytes(500 * 1024)).toBe("500\xa0KB");
  });
});
