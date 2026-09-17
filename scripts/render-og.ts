/**
 * Renders the social share card (public/og.png, 1200x630) from
 * the same tokens and self-hosted fonts the app uses, so the preview a link
 * gets on LinkedIn, WhatsApp or Slack matches the site. layout.tsx declares it
 * (with alt text) under openGraph.images and twitter.images. Not the
 * app/opengraph-image.png file convention: Turbopack ignores the companion
 * .alt.txt, so the card would ship without alt text.
 *
 * Not a test; run it by hand after a change to the brand or the tagline:
 *   npm run og
 * PW_CHROMIUM_PATH points at a preinstalled Chromium when `playwright install`
 * has not run (sandboxes); unset, Playwright uses its own.
 */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const css = readFileSync(path.resolve(ROOT, "src/app/globals.css"), "utf8");
function token(name: string): string {
  const m = css.match(new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1];
}
const font = (f: string) => readFileSync(path.resolve(ROOT, "src/fonts", f)).toString("base64");

const T = {
  stage: token("stage"),
  deep: token("stage-deep"),
  panel: token("stage-panel"),
  fg: token("stage-fg"),
  muted: token("stage-muted"),
  gold: token("gold"),
  mint: token("mint"),
  brass: token("brass"),
};

const ROWS = [
  ["1", "Quiz Pigs", "31"],
  ["2", "Norfolk & Chance", "26"],
  ["3", "The Usual Suspects", "21"],
];

const html = `<!doctype html><html><head><style>
@font-face { font-family: Slab; src: url(data:font/woff2;base64,${font("alfa-slab-one-latin-400-normal.woff2")}) format("woff2"); }
@font-face { font-family: Body; font-weight: 200 1000; src: url(data:font/woff2;base64,${font("nunito-sans-latin-wght-normal.woff2")}) format("woff2"); }
@font-face { font-family: Mono; font-weight: 600; src: url(data:font/woff2;base64,${font("ibm-plex-mono-latin-600-normal.woff2")}) format("woff2"); }
html, body { margin: 0; }
.card { width: 1200px; height: 630px; box-sizing: border-box; padding: 64px 72px; position: relative; overflow: hidden;
  color: ${T.fg}; font-family: Body, sans-serif;
  background-color: ${T.stage};
  background-image:
    radial-gradient(circle at 1px 1px, rgba(255,244,220,0.06) 1px, transparent 0),
    radial-gradient(ellipse 70% 55% at 30% -10%, rgba(255,176,46,0.22), transparent 62%),
    linear-gradient(180deg, ${T.stage} 0%, ${T.deep} 100%);
  background-size: 22px 22px, 100% 100%, 100% 100%; }
.card::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: ${T.brass}; }
.brand { display: flex; align-items: center; gap: 18px; }
.coaster { width: 64px; height: 64px; border-radius: 50%; background: ${T.deep}; border: 3px solid ${T.brass};
  display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.coaster span { font-family: Slab; color: ${T.gold}; font-size: 44px; line-height: 1; margin-top: 2px; }
.word { font-family: Slab; color: ${T.fg}; font-size: 54px; line-height: 1; }
.word em { font-style: normal; color: ${T.gold};
  text-shadow: 0 0 18px rgba(255,176,46,0.5), 0 0 42px rgba(255,176,46,0.22); }
.eyebrow { margin-top: 58px; font-family: Mono; font-weight: 600; font-size: 20px; letter-spacing: 0.2em; color: ${T.mint}; }
h1 { margin: 18px 0 0; font-family: Slab; font-weight: 400; font-size: 66px; line-height: 1.06; width: 640px; }
h1 em { font-style: normal; color: ${T.gold}; }
.sub { margin-top: 22px; font-size: 25px; line-height: 1.4; color: ${T.muted}; width: 600px; }
.url { position: absolute; left: 72px; bottom: 44px; font-family: Mono; font-weight: 600; font-size: 22px; color: ${T.fg}; letter-spacing: 0.04em; }
.board { position: absolute; right: 72px; top: 170px; width: 380px; background: ${T.panel};
  border: 1px solid rgba(184,128,42,0.55); border-radius: 14px; padding: 22px 24px; box-sizing: border-box;
  box-shadow: 0 30px 70px rgba(0,0,0,0.5); }
.bh { display: flex; justify-content: space-between; font-family: Mono; font-weight: 600; font-size: 14px; letter-spacing: 0.16em; color: ${T.muted}; }
.live { color: ${T.mint}; }
.row { display: flex; align-items: center; gap: 14px; margin-top: 12px; padding: 10px 14px; border-radius: 8px;
  background: ${T.deep}; border-left: 6px solid rgba(184,128,42,0.6); }
.row.r1 { border-left-color: ${T.gold}; }
.row.r2 { border-left-color: ${T.mint}; }
.rk { font-family: Slab; font-size: 22px; color: ${T.gold}; width: 18px; }
.nm { flex: 1; font-weight: 800; font-size: 21px; white-space: nowrap; }
.sc { font-family: Slab; font-size: 28px; color: ${T.fg}; }
</style></head><body><div class="card">
  <div class="brand"><div class="coaster"><span>?</span></div><div class="word">Trivia<em>foundry</em></div></div>
  <div class="eyebrow">PUB QUIZ · TRIVIA NIGHT</div>
  <h1>Tonight&rsquo;s quiz, <em>forged</em> while you pour.</h1>
  <div class="sub">Writes the whole night, prints the sheets, then runs it live on every team&rsquo;s phone.</div>
  <div class="url">triviafoundry.com</div>
  <div class="board">
    <div class="bh"><span>ROUND 2 · SCORES</span><span class="live">● LIVE</span></div>
    ${ROWS.map(([r, n, s]) => `<div class="row r${r}"><span class="rk">${r}</span><span class="nm">${n.replace("&", "&amp;")}</span><span class="sc">${s}</span></div>`).join("")}
  </div>
</div></body></html>`;

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const out = path.resolve(ROOT, "public/og.png");
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log("[og] wrote public/og.png");
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
