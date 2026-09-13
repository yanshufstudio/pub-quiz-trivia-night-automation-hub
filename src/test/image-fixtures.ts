/**
 * Hand-built JPEG and PNG headers for the media tests.
 *
 * src/lib/media.ts only ever reads headers, so a header is a complete
 * fixture: these bytes are parsed by exactly the code path a real photo's
 * first bytes take, with nothing binary checked into the repo and no
 * dependency on an encoder being installed. `trailing` pads a fixture out to
 * a chosen byte length for the size-cap cases.
 */

function uint32BE(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint16BE(value: number): number[] {
  return [(value >>> 8) & 0xff, value & 0xff];
}

export function pngBytes(width = 800, height = 600, trailing = 0): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    ...uint32BE(13), // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    ...uint32BE(width),
    ...uint32BE(height),
    8, // bit depth
    6, // colour type: RGBA
    0, 0, 0, // compression, filter, interlace
    ...new Array<number>(trailing).fill(0),
  ]);
}

/**
 * `exifBytes` puts an APP1 segment (what an EXIF block looks like) in front
 * of the frame header, and `fillBytes` pads the marker, so the marker walk
 * is exercised rather than a fixed offset that happens to work on the
 * simplest possible file.
 */
export function jpegBytes(width = 800, height = 600, { exifBytes = 0, fillBytes = 0 } = {}): Uint8Array {
  const app1 =
    exifBytes > 0 ? [0xff, 0xe1, ...uint16BE(exifBytes + 2), ...new Array<number>(exifBytes).fill(0x20)] : [];
  return new Uint8Array([
    0xff, 0xd8, // SOI
    ...app1,
    ...new Array<number>(fillBytes).fill(0xff), // legal padding in front of a marker
    0xff, 0xc0, // SOF0
    ...uint16BE(17), // segment length
    8, // sample precision
    ...uint16BE(height),
    ...uint16BE(width),
    3, // component count
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]);
}

export const SVG_SOURCE = '<svg xmlns="http://www.w3.org/2000/svg"><image href="http://169.254.169.254/" /></svg>';

export const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);

/**
 * A real, decodable 1x1 PNG — the fixtures above are headers, which is all
 * src/lib/media.ts reads, but @react-pdf/renderer actually decodes what it
 * is handed. Any test that puts an image through the PDF renderer needs
 * this one.
 */
export const REAL_PNG_1X1 = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);
