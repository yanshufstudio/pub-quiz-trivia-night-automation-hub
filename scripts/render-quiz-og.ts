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

/** A flame tongue: pointed at the top, flat at the bottom (the logs hide it), `w` either side of `cx`, `h` tall from `baseY`. */
function tongue(cx: number, baseY: number, w: number, h: number): string {
  const tip = baseY - h;
  return `M ${cx - w} ${baseY} C ${cx - w} ${baseY - h * 0.45}, ${cx - w * 0.2} ${baseY - h * 0.6}, ${cx} ${tip} C ${cx + w * 0.2} ${baseY - h * 0.6}, ${cx + w} ${baseY - h * 0.45}, ${cx + w} ${baseY} Z`;
}

/** One firework burst: rays out from (cx, cy), long and short in turn, each tipped with a dot. */
function burst(cx: number, cy: number, inner: number, outer: number, rays: number, color: string): string {
  const lines: string[] = [];
  const dots: string[] = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
    const reach = i % 2 === 0 ? outer : outer * 0.78;
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    const x = (r: number) => (cx + cos * r).toFixed(1);
    const y = (r: number) => (cy + sin * r).toFixed(1);
    lines.push(`<line x1="${x(inner)}" y1="${y(inner)}" x2="${x(reach)}" y2="${y(reach)}"/>`);
    dots.push(`<circle cx="${x(reach + 16)}" cy="${y(reach + 16)}" r="${i % 2 === 0 ? 6 : 4.5}"/>`);
  }
  return `<g stroke="${color}" stroke-width="6" stroke-linecap="round">${lines.join("")}</g><g fill="${color}">${dots.join("")}<circle cx="${cx}" cy="${cy}" r="7"/></g>`;
}

/** A bonfire from plain shapes, standing on `groundY` at `cx`, with three firework bursts above it. */
function bonfire(cx: number, groundY: number): string {
  const log = `fill="${T.brass}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4"`;
  const bursts = [
    burst(cx - 70, 125, 20, 80, 12, T.gold),
    burst(cx + 110, 95, 14, 58, 10, T.gold),
    burst(cx + 105, 240, 12, 44, 8, T.fg),
  ].join("");
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" style="position:absolute;left:0;top:0" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="halo" cx="${cx}" cy="${groundY - 90}" r="330" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${T.gold}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="${T.gold}" stop-opacity="0"/>
    </radialGradient>
    <filter id="lit" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10"/>
    </filter>
  </defs>
  <circle cx="${cx}" cy="${groundY - 90}" r="330" fill="url(#halo)"/>
  <g filter="url(#lit)" opacity="0.7">${bursts}</g>
  ${bursts}
  <path d="${tongue(cx - 72, groundY - 20, 56, 175)}" fill="${T.amber}"/>
  <path d="${tongue(cx + 70, groundY - 20, 52, 150)}" fill="${T.amber}"/>
  <path d="${tongue(cx, groundY - 20, 96, 235)}" fill="${T.amber}"/>
  <path d="${tongue(cx, groundY - 20, 64, 175)}" fill="${T.gold}"/>
  <path d="${tongue(cx, groundY - 20, 30, 95)}" fill="${T.fg}"/>
  <g fill="${T.gold}">
    <circle cx="${cx - 100}" cy="${groundY - 215}" r="5"/>
    <circle cx="${cx + 92}" cy="${groundY - 235}" r="4"/>
    <circle cx="${cx + 40}" cy="${groundY - 290}" r="6"/>
    <circle cx="${cx - 44}" cy="${groundY - 275}" r="3.5"/>
  </g>
  <rect x="${cx - 150}" y="${groundY - 34}" width="300" height="42" rx="21" transform="rotate(-14 ${cx} ${groundY - 13})" ${log}/>
  <rect x="${cx - 150}" y="${groundY - 34}" width="300" height="42" rx="21" transform="rotate(14 ${cx} ${groundY - 13})" ${log}/>
  <rect x="${cx - 165}" y="${groundY - 6}" width="330" height="40" rx="20" ${log}/>
</svg>`;
}

/** A point `r` from (cx, cy) at `deg` degrees clockwise from 3 o'clock. */
function polar(cx: number, cy: number, r: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
}

/** A pie of radius `r` with the slice from `cut[0]` to `cut[1]` degrees missing. */
function pieShape(cx: number, cy: number, r: number, cut: [number, number]): string {
  return `M ${cx} ${cy} L ${polar(cx, cy, r, cut[1])} A ${r} ${r} 0 1 1 ${polar(cx, cy, r, cut[0] + 360)} Z`;
}

/** One falling leaf: a pointed oval with a stem and a vein, `len` long, turned `deg` degrees. */
function leaf(cx: number, cy: number, len: number, deg: number, color: string): string {
  const h = len / 2;
  const w = len * 0.3;
  return `<g transform="translate(${cx} ${cy}) rotate(${deg})">
    <path d="M 0 ${-h} C ${w} ${-h * 0.5}, ${w} ${h * 0.5}, 0 ${h} C ${-w} ${h * 0.5}, ${-w} ${-h * 0.5}, 0 ${-h} Z"
          fill="${color}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 0 ${-h * 0.8} L 0 ${h + len * 0.16}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4" stroke-linecap="round"/>
  </g>`;
}

/** A pumpkin pie from plain shapes, seen from above with one slice cut out, centred on (cx, cy), and leaves falling beside it. */
function pumpkinPie(cx: number, cy: number): string {
  const cut: [number, number] = [-70, -25];
  const crustR = 168;
  // Pumpkin orange: the one colour here that is not a site token.
  const pumpkin = "#d96f1c";
  const scallops: string[] = [];
  for (let deg = cut[1] + 8; deg <= cut[0] + 360 - 8; deg += 15) {
    const [x, y] = polar(cx, cy, crustR - 6, deg).split(",");
    scallops.push(`<circle cx="${x}" cy="${y}" r="15"/>`);
  }
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" style="position:absolute;left:0;top:0" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="halo" cx="${cx}" cy="${cy}" r="340" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${T.gold}" stop-opacity="0.32"/>
      <stop offset="1" stop-color="${T.gold}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="baked" cx="${cx - 20}" cy="${cy + 10}" r="140" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${T.gold}" stop-opacity="0.35"/>
      <stop offset="0.7" stop-color="${T.gold}" stop-opacity="0"/>
      <stop offset="1" stop-color="${T.amber}" stop-opacity="0.6"/>
    </radialGradient>
  </defs>
  <circle cx="${cx}" cy="${cy}" r="340" fill="url(#halo)"/>
  <path d="${pieShape(cx, cy, crustR, cut)}" fill="${T.brass}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round"/>
  <g fill="${T.brass}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4">${scallops.join("")}</g>
  <path d="${pieShape(cx, cy, crustR - 30, cut)}" fill="${pumpkin}" stroke="${T.deep}" stroke-opacity="0.55" stroke-width="4" stroke-linejoin="round"/>
  <path d="${pieShape(cx, cy, crustR - 30, cut)}" fill="url(#baked)"/>
  <g fill="${T.fg}" stroke="${T.deep}" stroke-opacity="0.35" stroke-width="3">
    <circle cx="${cx - 30}" cy="${cy + 25}" r="34"/>
    <circle cx="${cx - 30}" cy="${cy + 8}" r="22"/>
    <circle cx="${cx - 30}" cy="${cy - 6}" r="11"/>
  </g>
  ${leaf(cx - 150, 95, 74, -35, T.gold)}
  ${leaf(cx + 150, 70, 62, 55, T.brass)}
  ${leaf(cx - 160, 540, 66, 30, T.brass)}
  ${leaf(cx + 160, 545, 70, -20, T.gold)}
</svg>`;
}

type Scene = {
  /** The words on the card, one per line; the last is the accent line. */
  lines: [string, string];
  art: () => string;
};

const SCENES: Record<string, Scene> = {
  halloween: { lines: ["Halloween", "trivia"], art: () => jackOLantern(918, 345) },
  "bonfire-night": { lines: ["Bonfire Night", "quiz"], art: () => bonfire(990, 520) },
  thanksgiving: { lines: ["Thanksgiving", "trivia"], art: () => pumpkinPie(990, 315) },
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
