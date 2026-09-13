/**
 * Validation for question images.
 *
 * Everything here works on the *bytes*. The request's `Content-Type` and any
 * filename are ignored entirely — they are attacker-controlled and say
 * nothing about what was actually uploaded. The MIME type stored on
 * `QuestionMedia` is the one this module derives from the magic number, and
 * it is the only one ever sent back out.
 *
 * Only JPEG and PNG are accepted. SVG is refused deliberately: it is a
 * document format, not a bitmap — it can reference external resources (the
 * exact network fetch the whole media design exists to avoid) and it is a
 * parser attack surface on every surface that renders it. A pub quiz does
 * not need it.
 *
 * The dimension cap is read out of the header, before anything decodes the
 * image. A few kilobytes of PNG can declare 50000x50000 and cost gigabytes
 * of RAM to decode; rejecting on the declared dimensions means no such file
 * ever reaches a decoder.
 *
 * Every image that reaches storage — upload or an imported pack file's
 * base64 blob — goes through `prepareImageForStorage` below, which sniffs
 * and validates the raw bytes (this module's original job) and then
 * re-encodes them with `sharp` (decided 2026-09-13, closing the "still
 * open" question phase 1 shipped with): sharp drops all metadata unless
 * asked to keep it, so a phone photo's EXIF — GPS coordinates included —
 * never reaches the stored bytes, and a hostile file that is merely
 * *shaped* like a JPEG/PNG with extra bytes appended (a polyglot) doesn't
 * survive a real decode-then-encode round trip. There is exactly one
 * function that turns request bytes into stored bytes, on both the upload
 * route and pack import, for the same reason there is exactly one
 * `validateImageBytes`.
 */

import sharp from "sharp";

export const MEDIA_MIME = {
  JPEG: "image/jpeg",
  PNG: "image/png",
} as const;

export type MediaMime = (typeof MEDIA_MIME)[keyof typeof MEDIA_MIME];

/**
 * 2 MB, chosen as the phase-1 default and stated here so it is one number in
 * one place. Nothing re-encodes uploads yet, so this is both the upload cap
 * and the stored size — a photo straight off a phone lands well inside it,
 * and 40 of them is a pack under 80 MB rather than an unbounded one. If the
 * `sharp` re-encode question is later answered yes, the stored size drops
 * and this cap can stay where it is.
 */
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

/** Per side. Comfortably above any photo worth projecting in a pub, and far
 * below the point where decoding one costs real memory. */
export const MAX_MEDIA_DIMENSION = 4096;

/**
 * Ceiling on images per pack (decided 2026-09-13, alongside the sharp
 * question below): the per-question uniqueness constraint and the 40
 * uploads/10 min rate limiter bound *speed*, not total size — a pack with
 * enough questions could otherwise still accumulate unlimited images. 40
 * is generous for a real picture round (one full round of questions, plus
 * headroom) while keeping a pack's worst-case media footprint bounded
 * (40 x MAX_MEDIA_BYTES). Enforced in the upload route and on pack import,
 * only when attaching a *new* image — replacing an existing one never
 * changes the count.
 */
export const MAX_MEDIA_PER_PACK = 40;

export type ImageInfo = {
  mime: MediaMime;
  width: number;
  height: number;
  byteSize: number;
};

export type MediaValidation = { ok: true; info: ImageInfo } | { ok: false; status: 400 | 413; error: string };

export const UNSUPPORTED_FORMAT_MESSAGE = "Only JPEG and PNG images are supported";

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) + bytes[offset + 1];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG's first chunk must be IHDR, which carries width and height. */
function readPngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // 8 signature + 4 length + 4 type + 8 dimensions
  if (bytes.length < 24) return null;
  const type = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (type !== "IHDR") return null;
  return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
}

// Start-of-frame markers, which are the ones carrying the image dimensions.
// 0xC4 (define Huffman tables), 0xC8 (reserved) and 0xCC (arithmetic coding
// conditioning) sit in the same 0xC0-0xCF block but are not frame headers.
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Walks the JPEG marker segments to the first start-of-frame header. There
 * is no fixed offset for it: the file may open with any number of
 * application/comment segments (EXIF, ICC profiles, thumbnails) first.
 */
function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2; // past SOI
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null; // not sitting on a marker: malformed
    // Any number of 0xFF bytes may pad the front of a marker.
    let marker = bytes[offset + 1];
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1];
    }

    // Standalone markers: no length, no payload.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image / start of scan: no frame header found

    if (offset + 4 > bytes.length) return null;
    const length = readUint16BE(bytes, offset + 2);
    if (length < 2) return null;

    if (isStartOfFrame(marker)) {
      // segment: length(2) precision(1) height(2) width(2)
      if (offset + 9 > bytes.length) return null;
      return { width: readUint16BE(bytes, offset + 7), height: readUint16BE(bytes, offset + 5) };
    }

    offset += 2 + length;
  }
  return null;
}

/**
 * Names the format of something we refuse, when it is one people plausibly
 * try. A precise "GIFs aren't supported" beats a blank "not supported" for
 * the person holding the file, and none of it changes the verdict.
 */
function describeRejectedFormat(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "GIF";
  if (startsWith(bytes, [0x42, 0x4d])) return "BMP";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])) {
    return "WebP";
  }
  if (startsWith(bytes.subarray(4), [0x66, 0x74, 0x79, 0x70])) return "HEIC/AVIF";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "PDF";
  // SVG is text, and may open with an XML declaration, a comment, a doctype
  // or whitespace before the <svg element itself.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).trimStart();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!DOCTYPE svg")) return "SVG";
  return null;
}

/**
 * The single gate every image passes through, whichever door it arrived by —
 * a direct upload today, a base64 blob inside an imported v2 pack file
 * tomorrow. A hostile pack file must never get a weaker check than a hostile
 * upload, so there is exactly one implementation of "is this an acceptable
 * image".
 */
export function validateImageBytes(bytes: Uint8Array): MediaValidation {
  if (bytes.length === 0) {
    return { ok: false, status: 400, error: "The uploaded file is empty" };
  }
  if (bytes.length > MAX_MEDIA_BYTES) {
    return { ok: false, status: 413, error: `Images must be ${formatBytes(MAX_MEDIA_BYTES)} or smaller` };
  }

  let mime: MediaMime;
  let dimensions: { width: number; height: number } | null;

  if (startsWith(bytes, PNG_SIGNATURE)) {
    mime = MEDIA_MIME.PNG;
    dimensions = readPngDimensions(bytes);
  } else if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    mime = MEDIA_MIME.JPEG;
    dimensions = readJpegDimensions(bytes);
  } else {
    const rejected = describeRejectedFormat(bytes);
    return {
      ok: false,
      status: 400,
      error: rejected ? `${rejected} images are not supported — use JPEG or PNG` : UNSUPPORTED_FORMAT_MESSAGE,
    };
  }

  // The signature matched but the header didn't parse, so the file is
  // truncated or does not hold the image it claims to. Either way nothing
  // downstream should try to render it.
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return { ok: false, status: 400, error: "That file looks damaged — its image header could not be read" };
  }

  if (dimensions.width > MAX_MEDIA_DIMENSION || dimensions.height > MAX_MEDIA_DIMENSION) {
    return {
      ok: false,
      status: 400,
      error: `Images must be at most ${MAX_MEDIA_DIMENSION}x${MAX_MEDIA_DIMENSION} pixels (this one is ${dimensions.width}x${dimensions.height})`,
    };
  }

  return { ok: true, info: { mime, width: dimensions.width, height: dimensions.height, byteSize: bytes.length } };
}

export function formatBytes(byteCount: number): string {
  if (byteCount >= 1024 * 1024) return `${Math.round(byteCount / (1024 * 1024))} MB`;
  return `${Math.round(byteCount / 1024)} KB`;
}

/**
 * A `data:` URI for the bytes — how the PDF renderer is given an image.
 * @react-pdf/renderer decodes these locally (`@react-pdf/image` handles the
 * `data:` case before it ever reaches its `fetch` path), so a document built
 * this way cannot make a network request no matter what is in the database.
 */
export function toDataUri(media: { mime: string; bytes: Uint8Array }): string {
  return `data:${media.mime};base64,${Buffer.from(media.bytes).toString("base64")}`;
}

export type ProcessedImage = {
  mime: MediaMime;
  bytes: Buffer;
  width: number;
  height: number;
  byteSize: number;
};

/**
 * Decodes and re-encodes validated image bytes, discarding whatever metadata
 * the original carried.
 *
 * `rotate()` with no argument applies the EXIF orientation flag (if any)
 * before that flag is gone — otherwise a phone photo taken in portrait would
 * come out sideways the moment its metadata is stripped. Not calling
 * `withMetadata()` afterward is what does the stripping: sharp's default
 * output carries none of the input's EXIF/ICC/XMP forward. `limitInputPixels`
 * is a second, decoder-level backstop behind the header-based dimension
 * check in `validateImageBytes` — belt and braces, not a replacement for it.
 *
 * Re-encodes to the same format it detected (JPEG stays JPEG, PNG stays
 * PNG): converting format as well isn't needed for the security property
 * here (a full decode/encode round trip already neutralises a polyglot
 * regardless of output format) and would cost quality/size for no benefit.
 *
 * Throws on anything sharp can't actually decode — bytes whose magic number
 * matched but whose body doesn't parse as a real image. Callers should treat
 * that the same as a validation failure.
 */
async function reencodeImage(bytes: Uint8Array, mime: MediaMime): Promise<ProcessedImage> {
  const pipeline = sharp(bytes, { limitInputPixels: MAX_MEDIA_DIMENSION * MAX_MEDIA_DIMENSION }).rotate();
  const { data, info } =
    mime === MEDIA_MIME.PNG
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  return { mime, bytes: data, width: info.width, height: info.height, byteSize: data.length };
}

export type PreparedImage = { ok: true; info: ProcessedImage } | { ok: false; status: 400 | 413; error: string };

/**
 * The single entry point for turning attacker-controlled bytes — a direct
 * upload's body or an imported pack file's decoded base64 — into what
 * `QuestionMedia` stores: sniff-and-validate, then re-encode. Both callers
 * (the upload route and pack import) go through this rather than repeating
 * the two steps, so neither can drift into skipping one of them.
 */
export async function prepareImageForStorage(bytes: Uint8Array): Promise<PreparedImage> {
  const validated = validateImageBytes(bytes);
  if (!validated.ok) return validated;

  try {
    const info = await reencodeImage(bytes, validated.info.mime);
    return { ok: true, info };
  } catch {
    // The magic number and declared dimensions checked out, but sharp
    // couldn't actually decode it — truncated, corrupt, or a header
    // deliberately detached from a body that isn't really an image.
    return { ok: false, status: 400, error: "That file looks damaged — its image data could not be decoded" };
  }
}
