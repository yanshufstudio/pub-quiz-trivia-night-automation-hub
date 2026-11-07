import type { AnimatedScene } from "./index";

/**
 * Christmas: a lit tree with a star on top, a pile of wrapped presents at its
 * foot, a string of colored lights hanging under "Christmas", snow falling,
 * and a hop running through "trivia". The lights twinkle (gently, each on its
 * own beat) and the star glows.
 *
 * Coordinates are in the 1200x630 viewBox. Each moving shape is drawn at its
 * still-frame position and every animation starts from there, after
 * var(--start), so the page first shows the frame the PNG shows and then comes
 * to life.
 */

const ROOT = ".quiz-scene-christmas";

/** Where the presents and the tree stand. */
const GROUND = 590;

/** "Christmas trivia" in the display face at 96px: where each line starts, where each letter of "trivia" starts, then where the word ends, and how wide "Christmas" is (measured in Chromium with src/fonts/alfa-slab-one). */
const WORDS_X = 72;
const LINE_1_Y = 205;
const LINE_2_Y = 395;
const TRIVIA_ADVANCES = [0, 43.3, 93.9, 127.1, 189.6, 222.8, 281.9];
const LINE_1_WIDTH = 522;

/** The tree's middle, and its three tiers: apex y, bottom y, half the width at the bottom. */
const TREE_X = 960;
const TIERS: [number, number, number][] = [
  [262, 525, 186],
  [178, 388, 140],
  [116, 252, 94],
];

const f = (n: number) => Number(n.toFixed(1));

/** The scene's paints, by name, used as classes. */
const PAINT = {
  ink: "stroke: var(--stage-deep); stroke-opacity: 0.55; stroke-width: 4; stroke-linejoin: round",
  "ink-soft": "stroke: var(--stage-deep); stroke-opacity: 0.35; stroke-width: 3; stroke-linejoin: round",
  "c-gold": "fill: var(--gold)",
  "c-brass": "fill: var(--brass)",
  "c-fg": "fill: var(--stage-fg)",
  "c-mint": "fill: var(--mint)",
  "c-panel": "fill: var(--stage-panel); fill-opacity: 0.7",
  // Not site tokens: the tree's greens, the trunk, and the red and blue of
  // the paper and the bulbs.
  "c-pine": "fill: #2f7d4e",
  "c-pine-dark": "fill: #23603b",
  "c-trunk": "fill: #6b4526",
  "c-red": "fill: #d4473a",
  "c-blue": "fill: #5d9ad8",
};
type Paint = keyof typeof PAINT;

/** The four bulb colors, in the order they repeat along a string. */
const BULBS: { paint: Paint; glow: string }[] = [
  { paint: "c-red", glow: "#d4473a" },
  { paint: "c-gold", glow: "var(--gold)" },
  { paint: "c-blue", glow: "#5d9ad8" },
  { paint: "c-mint", glow: "var(--mint)" },
];

/** A point on the quadratic curve from p0 through control c to p1, at t. */
function onCurve(p0: [number, number], c: [number, number], p1: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [f(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0]), f(u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1])];
}

/**
 * One bulb hanging from its socket at (x, y), tipped `tilt` degrees, in the
 * color `n` (counting round BULBS), with its glow. The glow and the bulb dim
 * and brighten together.
 */
function bulb(x: number, y: number, tilt: number, n: number, delay: number): string {
  const { paint } = BULBS[n % BULBS.length];
  return `<g transform="translate(${x} ${y}) rotate(${tilt})"><g class="twinkle" style="--delay:${f(delay)}s">
    <circle cy="20" r="24" fill="url(#xm-glow-${n % BULBS.length})"/>
    <path d="M -7 8 C -10 18, -6 28, 0 32 C 6 28, 10 18, 7 8 Z" class="${paint} ink-soft"/>
    <rect x="-5.5" y="0" width="11" height="10" rx="2" class="c-brass ink-soft"/>
  </g></g>`;
}

/** The string of lights under "Christmas": a sagging wire with twelve bulbs. */
function lightString(): string {
  const p0: [number, number] = [WORDS_X + 4, 236];
  const p1: [number, number] = [WORDS_X + LINE_1_WIDTH - 4, 236];
  const c: [number, number] = [(p0[0] + p1[0]) / 2, 280];
  const count = 12;
  const bulbs: string[] = [];
  for (let i = 0; i < count; i++) {
    const [x, y] = onCurve(p0, c, p1, (i + 0.5) / count);
    bulbs.push(bulb(x, y, i % 2 === 0 ? -12 : 12, i, (i * 0.83) % 2.8));
  }
  return `<path d="M ${p0[0]} ${p0[1]} Q ${c[0]} ${c[1]} ${p1[0]} ${p1[1]}" class="wire"/>${bulbs.join("")}`;
}

/** Where tier `k`'s garland runs: from low on the left to lower on the right, sagging. */
function garlandCurve(k: number): [[number, number], [number, number], [number, number]] {
  const [apex, bottom, half] = TIERS[k];
  const h = bottom - apex;
  const at = (frac: number, side: number): [number, number] => [f(TREE_X + side * half * frac * 0.92), f(apex + h * frac)];
  const p0 = at(0.5, -1);
  const p1 = at(0.82, 1);
  return [p0, [f((p0[0] + p1[0]) / 2), f((p0[1] + p1[1]) / 2 + 26)], p1];
}

/** The tree, without its lights: three tiers, a trunk, a gold garland on each tier, and a few baubles. */
function tree(): string {
  const tiers = TIERS.map(([apex, bottom, half]) => {
    const [l, r] = [TREE_X - half, TREE_X + half];
    return `<path d="M ${TREE_X} ${apex} L ${r} ${bottom} Q ${TREE_X} ${bottom + 24} ${l} ${bottom} Z" class="c-pine ink"/>
    <path d="M ${TREE_X} ${apex + 10} L ${f(TREE_X - half * 0.86)} ${bottom - 2} Q ${f(TREE_X - half * 0.4)} ${bottom + 12} ${TREE_X - 6} ${bottom + 12} Z" class="c-pine-dark"/>`;
  });
  const garlands = TIERS.map((_, k) => {
    const [p0, c, p1] = garlandCurve(k);
    return `<path d="M ${p0[0]} ${p0[1]} Q ${c[0]} ${c[1]} ${p1[0]} ${p1[1]}" class="tinsel"/>`;
  });
  const baubles: [number, number, number, Paint][] = [
    [TREE_X - 52, 470, 13, "c-red"],
    [TREE_X + 70, 452, 12, "c-gold"],
    [TREE_X - 92, 424, 11, "c-fg"],
    [TREE_X - 34, 334, 11, "c-gold"],
    [TREE_X + 44, 356, 12, "c-red"],
    [TREE_X + 8, 214, 10, "c-red"],
  ];
  return `<circle cx="${TREE_X}" cy="330" r="310" fill="url(#xm-halo)"/>
  <rect x="${TREE_X - 24}" y="510" width="48" height="${GROUND - 510}" class="c-trunk ink"/>
  ${tiers.join("")}
  ${garlands.join("")}
  ${baubles.map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" class="${c} ink-soft"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${f(r * 0.28)}" class="c-fg" opacity="0.7"/>`).join("")}`;
}

/** The lights on the tree: fourteen bulbs along the three garlands. */
function treeLights(): string {
  const counts = [5, 5, 4];
  let n = 0;
  return counts
    .flatMap((count, k) => {
      const [p0, c, p1] = garlandCurve(k);
      return Array.from({ length: count }, (_, i) => {
        const [x, y] = onCurve(p0, c, p1, (i + 0.5) / count);
        const out = bulb(x, f(y - 4), 0, n + 1, (n * 0.61 + 0.3) % 2.8);
        n++;
        return out;
      });
    })
    .join("");
}

/** A five-pointed star of outer radius `r` centred on the origin. */
function starPath(r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${f(Math.cos(a) * rr)},${f(Math.sin(a) * rr)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

/** The star on top of the tree, with its glow; it glows a little brighter and turns a little, now and then. */
function star(): string {
  return `<g transform="translate(${TREE_X} ${TIERS[2][0] - 10})"><g class="star">
    <circle r="62" fill="url(#xm-glow-1)"/>
    <path d="${starPath(36)}" class="c-gold ink"/>
    <path d="${starPath(16)}" class="c-fg" opacity="0.6"/>
  </g></g>`;
}

/** One wrapped present standing on the ground: box, ribbon both ways, a bow on top. */
function present(x: number, w: number, h: number, box: Paint, ribbon: Paint): string {
  const y = GROUND - h;
  const cx = f(x + w / 2);
  const band = f(Math.max(10, w * 0.14));
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" class="${box} ink"/>
  <rect x="${f(cx - band / 2)}" y="${y}" width="${band}" height="${h}" class="${ribbon}"/>
  <rect x="${x}" y="${f(y + h * 0.42)}" width="${w}" height="${f(band * 0.8)}" class="${ribbon}"/>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" class="ink"/>
  <ellipse cx="${f(cx - 15)}" cy="${y - 8}" rx="17" ry="10" transform="rotate(-24 ${f(cx - 15)} ${y - 8})" class="${ribbon} ink-soft"/>
  <ellipse cx="${f(cx + 15)}" cy="${y - 8}" rx="17" ry="10" transform="rotate(24 ${f(cx + 15)} ${y - 8})" class="${ribbon} ink-soft"/>
  <circle cx="${cx}" cy="${y - 4}" r="7" class="${ribbon} ink-soft"/>`;
}

/** The pile at the tree's foot, back to front. */
function presents(): string {
  return [
    present(1012, 132, 78, "c-fg", "c-red"),
    present(752, 124, 92, "c-red", "c-gold"),
    present(1118, 64, 50, "c-brass", "c-fg"),
    present(870, 104, 116, "c-blue", "c-gold"),
    present(970, 82, 58, "c-gold", "c-red"),
    present(778, 70, 46, "c-mint", "c-red"),
  ].join("");
}

/** The glow behind "trivia": a blurred copy, drawn once on the still layer. */
function triviaGlow(): string {
  return `<text x="${WORDS_X}" y="${LINE_2_Y}" class="word c-gold" filter="url(#xm-blur)" opacity="0.65">trivia</text>`;
}

/** "Christmas" in cream with the lights under it, then "trivia" in gold with a hop running through its letters. */
function words(): string {
  // Each letter is drawn with the middle of its foot at the origin, so it hops and tips from there.
  const letters = "trivia".split("").map((ch, i) => {
    const half = (TRIVIA_ADVANCES[i + 1] - TRIVIA_ADVANCES[i]) / 2;
    return `<g transform="translate(${f(WORDS_X + TRIVIA_ADVANCES[i] + half)} ${LINE_2_Y})"><g class="hop" style="--delay:${f(i * 0.11)}s"><text x="${f(-half)}" class="word c-gold">${ch}</text></g></g>`;
  });
  return `<text x="${WORDS_X}" y="${LINE_1_Y}" class="word c-fg">Christmas</text>
  ${lightString()}
  ${letters.join("")}`;
}

/** A snowflake about 24 across, centred on the origin; drawn once and reused. */
const FLAKE = `<g id="xm-flake" style="stroke: var(--stage-fg); stroke-width: 3; stroke-linecap: round; fill: none">
  <path d="M 0 -12 L 0 12 M -10.4 -6 L 10.4 6 M -10.4 6 L 10.4 -6"/>
  <path d="M -3 -9 L 0 -6 L 3 -9 M -3 9 L 0 6 L 3 9" style="stroke-width: 2"/>
</g>`;

/**
 * Snow drifting down, each flake drawn at its still-frame spot. A flake first
 * drops from that spot to below the bottom edge, then falls from above the top
 * edge to below the bottom over and over, at the same speed.
 */
function snow(): string {
  const top = -40;
  const bottom = 670;
  const flakes: [number, number, number, number][] = [
    [520, 70, 1, 17],
    [660, 300, 0.7, 21],
    [610, 520, 0.9, 19],
    [740, 150, 0.8, 23],
    [300, 470, 0.7, 20],
    [1150, 90, 1, 18],
    [1170, 330, 0.75, 22],
    [40, 560, 0.8, 24],
    [420, 300, 0.6, 26],
  ];
  return flakes
    .map(([x, y, s, secs]) => {
      const firstDrop = f((secs * (bottom - y)) / (bottom - top));
      return `<g transform="translate(${x} ${y})"><g class="fall" style="--y:${y}px;--dur:${secs}s;--in:${firstDrop}s">
      <use href="#xm-flake" transform="scale(${s})" opacity="0.85"/></g></g>`;
    })
    .join("");
}

/** The still layer: the room, the ground, the tree, the presents and the glow. Nothing here moves. */
const back = `<defs>
  <linearGradient id="xm-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--stage)"/>
    <stop offset="1" style="stop-color:var(--stage-deep)"/>
  </linearGradient>
  <radialGradient id="xm-overhead" cx="360" cy="-63" r="840" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 -37.2) scale(1 0.41)">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.22"/>
    <stop offset="0.62" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <pattern id="xm-dots" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" style="fill:var(--stage-fg)" fill-opacity="0.06"/>
  </pattern>
  <radialGradient id="xm-halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.3"/>
    <stop offset="1" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <filter id="xm-blur" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="12"/>
  </filter>
</defs>
<rect width="1200" height="630" fill="url(#xm-sky)"/>
<rect width="1200" height="630" fill="url(#xm-overhead)"/>
<rect width="1200" height="630" fill="url(#xm-dots)"/>
<path d="M 0 588 Q 300 566 600 586 T 1200 580 L 1200 630 L 0 630 Z" class="c-panel"/>
${tree()}
${presents()}
${triviaGlow()}
<rect y="620" width="1200" height="10" class="c-brass"/>`;

/** The moving layer, over the still one: the lights, the star, the snow, and the words. */
const front = `<defs>${FLAKE}
  ${BULBS.map(
    ({ glow }, i) => `<radialGradient id="xm-glow-${i}" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:${glow}" stop-opacity="0.55"/>
    <stop offset="1" style="stop-color:${glow}" stop-opacity="0"/>
  </radialGradient>`,
  ).join("")}
</defs>
${treeLights()}
${star()}
${snow()}
${words()}`;

const css = `
${Object.entries(PAINT)
  .map(([name, rules]) => `${ROOT} .${name} { ${rules}; }`)
  .join("\n")}
${ROOT} .wire { fill: none; stroke: var(--stage-deep); stroke-width: 4; stroke-linecap: round; }
${ROOT} .tinsel { fill: none; stroke: var(--gold); stroke-opacity: 0.8; stroke-width: 5; stroke-linecap: round; stroke-dasharray: 2 9; }
${ROOT} .word { font-family: var(--font-display), "Rockwell Extra Bold", Georgia, serif; font-size: 96px; }

${ROOT} .twinkle { animation: xm-twinkle 2.8s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes xm-twinkle { 50% { opacity: 0.4; } }
${ROOT} .star { animation: xm-star 4s ease-in-out var(--start) infinite; }
@keyframes xm-star { 50% { transform: scale(1.1) rotate(8deg); } }

${ROOT} .fall {
  animation: xm-drop var(--in) linear var(--start) 1, xm-fall var(--dur) linear calc(var(--start) + var(--in)) infinite;
}
@keyframes xm-drop { to { transform: translateY(calc(670px - var(--y))); } }
@keyframes xm-fall {
  from { transform: translateY(calc(-40px - var(--y))); }
  to { transform: translateY(calc(670px - var(--y))); }
}
${ROOT} .hop { animation: xm-hop 4s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes xm-hop {
  0%, 30%, 100% { transform: none; }
  8% { transform: translateY(-14px) rotate(-6deg); }
  16% { transform: none; }
  23% { transform: translateY(-6px) rotate(4deg); }
}
`;

export const christmasScene: AnimatedScene = { back, front, css };
