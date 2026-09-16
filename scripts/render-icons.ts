/**
 * Renders the "Coaster" brand mark (see src/components/BrandMark.tsx) into
 * every icon file the app ships, so the favicon set can never drift from the
 * mark or the palette in globals.css:
 *
 *   public/icon-256.png, public/icon-512.png   — round coaster, transparent
 *                                                 corners (manifest "any")
 *   public/icon-512-square.png                 — full-bleed square (manifest
 *                                                 "maskable"; safe zone is the
 *                                                 central 80%)
 *   src/app/icon.png (32), src/app/apple-icon.png (180), src/app/favicon.ico (48)
 *
 * Not a test; run it by hand after a change to the mark or the tokens:
 *   npm run icons
 * PW_CHROMIUM_PATH points at a preinstalled Chromium when `playwright install`
 * has not run (sandboxes); unset, Playwright uses its own.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

function cssToken(name: string): string {
  const css = readFileSync(path.resolve(ROOT, "src/app/globals.css"), "utf8");
  const match = css.match(new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --${name} not found in globals.css`);
  return match[1];
}

const STAGE_DEEP = cssToken("stage-deep");
const BRASS = cssToken("brass");
const GOLD = cssToken("gold");
const FONT = readFileSync(path.resolve(ROOT, "src/fonts/alfa-slab-one-latin-400-normal.woff2")).toString("base64");

// `square` paints the coaster edge-to-edge (no rim) for the maskable icon;
// otherwise the mark is a circle on a transparent ground with a brass rim.
function html(size: number, square: boolean) {
  const rim = square ? 0 : Math.max(2, Math.round(size * 0.045));
  return `<!doctype html><html><head><style>
    @font-face { font-family: Alfa; src: url(data:font/woff2;base64,${FONT}) format("woff2"); }
    html, body { margin: 0; background: transparent; }
    .mark { width: ${size}px; height: ${size}px; box-sizing: border-box; display: flex; align-items: center; justify-content: center;
      background: ${STAGE_DEEP}; border-radius: ${square ? 0 : "50%"}; border: ${rim}px solid ${BRASS}; }
    .q { font-family: Alfa, serif; color: ${GOLD}; font-size: ${Math.round(size * (square ? 0.62 : 0.72))}px; line-height: 1; margin-top: ${Math.round(size * 0.03)}px; }
  </style></head><body><div class="mark"><span class="q">?</span></div></body></html>`;
}

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage();
  const targets: { file: string; size: number; square: boolean }[] = [
    { file: "public/icon-256.png", size: 256, square: false },
    { file: "public/icon-512.png", size: 512, square: false },
    { file: "public/icon-512-square.png", size: 512, square: true },
    { file: "src/app/icon.png", size: 32, square: false },
    { file: "src/app/apple-icon.png", size: 180, square: true },
  ];
  for (const t of targets) {
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(html(t.size, t.square));
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
    writeFileSync(path.resolve(ROOT, t.file), png);
    console.log(`[icons] wrote ${t.file}`);
  }
  // favicon.ico: a 48px PNG wrapped in an ICO directory (browsers accept
  // PNG-in-ICO; that is also what Next served before this script existed).
  await page.setViewportSize({ width: 48, height: 48 });
  await page.setContent(html(48, false));
  await page.evaluate(() => document.fonts.ready);
  const png48 = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: 48, height: 48 } });
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(48, 6); // width
  header.writeUInt8(48, 7); // height
  header.writeUInt8(0, 8); // palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bpp
  header.writeUInt32LE(png48.length, 14); // bytes
  header.writeUInt32LE(22, 18); // offset
  writeFileSync(path.resolve(ROOT, "src/app/favicon.ico"), Buffer.concat([header, png48]));
  console.log("[icons] wrote src/app/favicon.ico");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
