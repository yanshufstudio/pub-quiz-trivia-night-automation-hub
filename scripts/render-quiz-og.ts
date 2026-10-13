/**
 * Renders the picture for one public quiz page (public/quizzes/<slug>.png,
 * 1200x630): the graphic at the top of the page and the page's og:image. Same
 * tokens and self-hosted display font as scripts/render-og.ts, so a shared
 * link looks like the site.
 *
 * The output path and size come from the quiz's own `image` in
 * src/content/quizzes, so the file the page asks for is the file this writes.
 * Each quiz needs a scene below: the words and the drawing. Original shapes
 * only; no photos, film stills, posters or characters.
 *
 * Not a test; run it by hand after a change to a scene or to the brand:
 *   npm run og:quiz -- halloween
 * PW_CHROMIUM_PATH points at a preinstalled Chromium when `playwright install`
 * has not run (sandboxes); unset, Playwright uses its own.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { QUIZZES } from "../src/content/quizzes";

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
  fg: token("stage-fg"),
  gold: token("gold"),
  amber: token("amber"),
  brass: token("brass"),
};

/** A jack-o'-lantern from plain shapes, centred on (cx, cy). */
function jackOLantern(cx: number, cy: number): string {
  const rib = `fill="${T.brass}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4"`;
  const outerRib = `fill="${T.amber}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4"`;
  // Carved holes, drawn twice: blurred in gold underneath for the light
  // coming out, then crisp on top.
  const face = `
    <polygon points="${cx - 112},${cy - 36} ${cx - 44},${cy - 36} ${cx - 76},${cy - 100}"/>
    <polygon points="${cx + 44},${cy - 36} ${cx + 112},${cy - 36} ${cx + 76},${cy - 100}"/>
    <polygon points="${cx},${cy - 10} ${cx - 22},${cy + 32} ${cx + 22},${cy + 32}"/>
    <polygon points="${cx - 118},${cy + 62} ${cx + 118},${cy + 62} ${cx + 100},${cy + 104} ${cx + 74},${cy + 80} ${cx + 50},${cy + 120} ${cx + 26},${cy + 82} ${cx},${cy + 124} ${cx - 26},${cy + 82} ${cx - 50},${cy + 120} ${cx - 74},${cy + 80} ${cx - 100},${cy + 104}"/>`;
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" style="position:absolute;left:0;top:0" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="halo" cx="${cx}" cy="${cy}" r="360" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${T.gold}" stop-opacity="0.38"/>
      <stop offset="1" stop-color="${T.gold}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shade" cx="${cx}" cy="${cy + 20}" r="250" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${T.gold}" stop-opacity="0.7"/>
      <stop offset="0.55" stop-color="${T.gold}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${T.deep}" stop-opacity="0.4"/>
    </radialGradient>
    <clipPath id="body">
      <ellipse cx="${cx - 160}" cy="${cy + 12}" rx="86" ry="160"/>
      <ellipse cx="${cx + 160}" cy="${cy + 12}" rx="86" ry="160"/>
      <ellipse cx="${cx - 82}" cy="${cy + 4}" rx="102" ry="184"/>
      <ellipse cx="${cx + 82}" cy="${cy + 4}" rx="102" ry="184"/>
      <ellipse cx="${cx}" cy="${cy}" rx="104" ry="192"/>
    </clipPath>
    <filter id="lit" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="12"/>
    </filter>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="360" fill="url(#halo)"/>
  <path d="M ${cx - 22} ${cy - 165} C ${cx - 30} ${cy - 215}, ${cx - 8} ${cy - 250}, ${cx + 28} ${cy - 262} L ${cx + 52} ${cy - 240} C ${cx + 30} ${cy - 228}, ${cx + 26} ${cy - 205}, ${cx + 32} ${cy - 165} Z"
        fill="${T.amber}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="${cx - 160}" cy="${cy + 12}" rx="86" ry="160" ${outerRib}/>
  <ellipse cx="${cx + 160}" cy="${cy + 12}" rx="86" ry="160" ${outerRib}/>
  <ellipse cx="${cx - 82}" cy="${cy + 4}" rx="102" ry="184" ${rib}/>
  <ellipse cx="${cx + 82}" cy="${cy + 4}" rx="102" ry="184" ${rib}/>
  <ellipse cx="${cx}" cy="${cy}" rx="104" ry="192" ${rib}/>
  <rect x="${cx - 260}" y="${cy - 200}" width="520" height="400" fill="url(#shade)" clip-path="url(#body)"/>
  <g fill="${T.gold}" filter="url(#lit)">${face}</g>
  <g fill="${T.fg}">${face}</g>
</svg>`;
}

type Scene = {
  /** The words on the card, one per line; the last is the accent line. */
  lines: [string, string];
  art: () => string;
};

const SCENES: Record<string, Scene> = {
  halloween: { lines: ["Halloween", "quiz"], art: () => jackOLantern(918, 345) },
};

function buildHtml(scene: Scene, width: number, height: number): string {
  return `<!doctype html><html><head><style>
@font-face { font-family: Slab; src: url(data:font/woff2;base64,${font("alfa-slab-one-latin-400-normal.woff2")}) format("woff2"); }
html, body { margin: 0; }
.card { width: ${width}px; height: ${height}px; position: relative; overflow: hidden;
  background-color: ${T.stage};
  background-image:
    radial-gradient(circle at 1px 1px, rgba(255,244,220,0.06) 1px, transparent 0),
    radial-gradient(ellipse 70% 55% at 30% -10%, rgba(255,176,46,0.22), transparent 62%),
    linear-gradient(180deg, ${T.stage} 0%, ${T.deep} 100%);
  background-size: 22px 22px, 100% 100%, 100% 100%; }
.card::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: ${T.brass}; }
.words { position: absolute; left: 72px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center;
  font-family: Slab; font-size: 96px; line-height: 1.08; color: ${T.fg}; }
.words em { font-style: normal; color: ${T.gold};
  text-shadow: 0 0 18px rgba(255,176,46,0.5), 0 0 42px rgba(255,176,46,0.22); }
</style></head><body><div class="card">
  ${scene.art()}
  <div class="words"><span>${scene.lines[0]}</span><em>${scene.lines[1]}</em></div>
</div></body></html>`;
}

async function main() {
  const slug = process.argv[2];
  const quiz = QUIZZES.find((q) => q.slug === slug);
  if (!quiz) {
    throw new Error(`usage: npm run og:quiz -- <slug>   (slugs: ${QUIZZES.map((q) => q.slug).join(", ")})`);
  }
  const scene = SCENES[quiz.slug];
  if (!scene) throw new Error(`no scene for "${quiz.slug}" in scripts/render-quiz-og.ts`);
  const { width, height, url } = quiz.image;

  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(buildHtml(scene, width, height));
  await page.evaluate(() => document.fonts.ready);
  const out = path.resolve(ROOT, `public${url}`);
  mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } });
  console.log(`[og:quiz] wrote public${url}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
