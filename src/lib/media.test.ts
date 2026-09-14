import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_DIMENSION,
  MEDIA_MIME,
  prepareImageForStorage,
  toDataUri,
  validateImageBytes,
} from "@/lib/media";
import { GIF_BYTES, jpegBytes, pngBytes, realJpegBytes, realJpegWithExif, realPngBytes } from "@/test/image-fixtures";

describe("validateImageBytes", () => {
  it("accepts a PNG and reads its dimensions from IHDR", () => {
    const result = validateImageBytes(pngBytes(1024, 768));
    expect(result).toMatchObject({
      ok: true,
      info: { mime: MEDIA_MIME.PNG, width: 1024, height: 768 },
    });
  });

  it("accepts a JPEG and reads its dimensions from the frame header", () => {
    const result = validateImageBytes(jpegBytes(640, 480));
    expect(result).toMatchObject({
      ok: true,
      info: { mime: MEDIA_MIME.JPEG, width: 640, height: 480 },
    });
  });

  it("walks past an EXIF block to find the JPEG frame header", () => {
    const result = validateImageBytes(jpegBytes(300, 200, { exifBytes: 512 }));
    expect(result).toMatchObject({ ok: true, info: { width: 300, height: 200 } });
  });

  it("tolerates fill bytes in front of a JPEG marker", () => {
    const result = validateImageBytes(jpegBytes(300, 200, { fillBytes: 3 }));
    expect(result).toMatchObject({ ok: true, info: { width: 300, height: 200 } });
  });

  it("reports the real byte length, not anything the caller claimed", () => {
    const bytes = pngBytes(10, 10, 4242);
    const result = validateImageBytes(bytes);
    expect(result.ok && result.info.byteSize).toBe(bytes.length);
  });

  it("rejects an empty body", () => {
    expect(validateImageBytes(new Uint8Array())).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects anything over the size cap with 413", () => {
    const oversized = new Uint8Array(MAX_MEDIA_BYTES + 1);
    oversized.set(pngBytes(10, 10));
    expect(validateImageBytes(oversized)).toMatchObject({ ok: false, status: 413 });
  });

  it("accepts a file sitting exactly on the size cap", () => {
    const exact = pngBytes(10, 10, MAX_MEDIA_BYTES - pngBytes(10, 10).length);
    expect(exact.length).toBe(MAX_MEDIA_BYTES);
    expect(validateImageBytes(exact)).toMatchObject({ ok: true });
  });

  // A PNG declaring vast dimensions is a few hundred bytes on disk and
  // gigabytes decoded. The cap is checked against the header so nothing
  // ever decodes one.
  it("rejects a decompression bomb on its declared dimensions", () => {
    const bomb = pngBytes(50000, 50000);
    expect(bomb.length).toBeLessThan(1024);
    const result = validateImageBytes(bomb);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(result.ok === false && result.error).toMatch(/50000x50000/);
  });

  it.each([
    [MAX_MEDIA_DIMENSION, MAX_MEDIA_DIMENSION, true],
    [MAX_MEDIA_DIMENSION + 1, 10, false],
    [10, MAX_MEDIA_DIMENSION + 1, false],
  ])("dimension cap: %ix%i accepted=%s", (width, height, accepted) => {
    expect(validateImageBytes(pngBytes(width, height)).ok).toBe(accepted);
  });

  it("rejects SVG, whatever it leads with", () => {
    const encoder = new TextEncoder();
    for (const source of [
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://169.254.169.254/" /></svg>',
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
      '\n  <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN">',
    ]) {
      const result = validateImageBytes(encoder.encode(source));
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toMatch(/SVG/);
    }
  });

  it.each([
    ["GIF", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ["BMP", [0x42, 0x4d, 0x36, 0x00]],
    ["WebP", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
    ["PDF", [0x25, 0x50, 0x44, 0x46, 0x2d]],
  ])("rejects %s and says so", (name, signature) => {
    const result = validateImageBytes(new Uint8Array(signature));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain(name);
  });

  it("rejects bytes that match no known signature", () => {
    const result = validateImageBytes(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  // A polyglot: valid PNG magic bytes on the front of something else. The
  // signature alone is not the check — the header behind it has to parse.
  it("rejects a file wearing a PNG signature over a header that does not parse", () => {
    const fake = new Uint8Array([...pngBytes().slice(0, 12), 0x6a, 0x75, 0x6e, 0x6b, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(validateImageBytes(fake)).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a truncated PNG", () => {
    expect(validateImageBytes(pngBytes().slice(0, 16))).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a JPEG whose frame header never arrives", () => {
    expect(validateImageBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a JPEG claiming zero dimensions", () => {
    expect(validateImageBytes(jpegBytes(0, 0))).toMatchObject({ ok: false, status: 400 });
  });
});

describe("toDataUri", () => {
  it("inlines the bytes, so nothing downstream has a URL to fetch", () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    expect(toDataUri({ mime: MEDIA_MIME.PNG, bytes })).toBe("data:image/png;base64,AQIDBA==");
  });
});

describe("prepareImageForStorage", () => {
  it("rejects on validateImageBytes' terms before ever touching sharp", async () => {
    // GIF_BYTES fails the magic-number check, which is exactly what
    // validateImageBytes is for — this must short-circuit rather than hand
    // non-image bytes to a decoder.
    const result = await prepareImageForStorage(GIF_BYTES);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("re-encodes a real PNG and reports its actual (decoded) dimensions", async () => {
    const png = await realPngBytes(6, 4);
    const result = await prepareImageForStorage(png);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.info.mime).toBe(MEDIA_MIME.PNG);
    expect(result.info.width).toBe(6);
    expect(result.info.height).toBe(4);
    // A real re-encode, not a pass-through of the input bytes.
    expect(Buffer.from(result.info.bytes)).not.toEqual(png);
    // And the output has to actually be what it claims — decodable, same size.
    const decoded = await sharp(result.info.bytes).metadata();
    expect(decoded.format).toBe("png");
    expect(decoded.width).toBe(6);
    expect(decoded.height).toBe(4);
  });

  it("re-encodes a real JPEG, keeping its format", async () => {
    const jpeg = await realJpegBytes(5, 3);
    const result = await prepareImageForStorage(jpeg);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.info.mime).toBe(MEDIA_MIME.JPEG);
    const decoded = await sharp(result.info.bytes).metadata();
    expect(decoded.format).toBe("jpeg");
    expect(decoded.width).toBe(5);
    expect(decoded.height).toBe(3);
  });

  // The actual point of the sharp decision: a phone photo's EXIF — GPS
  // included — must not survive into what gets stored and later served to
  // anyone holding the question id.
  it("strips EXIF metadata (GPS included) from the re-encoded bytes", async () => {
    const withExif = await realJpegWithExif(4, 4);
    const before = await sharp(withExif).metadata();
    expect(before.exif).toBeTruthy();
    expect(before.exif!.toString("latin1")).toContain("TestCam");

    const result = await prepareImageForStorage(withExif);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    const after = await sharp(result.info.bytes).metadata();
    expect(after.exif).toBeUndefined();
  });

  it("rejects bytes that pass the header sniff but sharp cannot decode", async () => {
    // A well-formed PNG signature and IHDR (satisfies validateImageBytes),
    // but no actual image data behind it — the header/body split
    // `prepareImageForStorage` exists to catch that `validateImageBytes`
    // alone cannot, since it never decodes anything.
    const result = await prepareImageForStorage(pngBytes(10, 10));
    expect(result).toMatchObject({ ok: false, status: 400 });
    if (result.ok) throw new Error("expected rejection");
    expect(result.error).toMatch(/damaged/i);
  });

  it("still enforces the dimension cap on a real image that would decode fine", async () => {
    // Below MAX_MEDIA_BYTES but declaring more pixels than MAX_MEDIA_DIMENSION
    // allows on a side — validateImageBytes must catch this before sharp
    // ever gets a chance to decode it.
    const oversized = jpegBytes(MAX_MEDIA_DIMENSION + 1, 10);
    const result = await prepareImageForStorage(oversized);
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});
