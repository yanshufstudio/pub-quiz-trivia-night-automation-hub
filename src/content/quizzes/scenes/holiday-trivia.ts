import type { AnimatedScene } from "./index";

/**
 * Holiday trivia: a lit Hanukkah menorah (a hanukkiah: eight candles in a row
 * and the shamash, the helper candle, standing higher in the middle), a row of
 * three painted diyas on a rangoli for Diwali, set apart from the menorah so
 * they read as their own festival, a red paper lantern hanging from a string
 * of lights across the top, and a hop running through "trivia". The flames flicker, the lantern
 * sways gently and the lights twinkle. No figures, no symbols beyond the lamps.
 *
 * Coordinates are in the 1200x630 viewBox. Each moving shape is drawn at its
 * still-frame position and every animation starts from there, after
 * var(--start), so the page first shows the frame the PNG shows and then comes
 * to life.
 */

const ROOT = ".quiz-scene-holiday-trivia";

/** Where the menorah and the diyas stand. */
const GROUND = 590;

/** "Holiday trivia" in the display face at 96px: where each line starts, and where each letter of "trivia" starts, then where the word ends (measured in Chromium with src/fonts/alfa-slab-one). */
const WORDS_X = 72;
const LINE_1_Y = 205;
const LINE_2_Y = 395;
const TRIVIA_ADVANCES = [0, 43.3, 93.9, 127.1, 189.6, 222.8, 281.9];

/** The menorah: its middle, the height of the eight cups, how far apart the candles are, and how much higher the shamash's cup is. */
const MENORAH_X = 720;
const CUP_Y = 432;
const SPACING = 26;
const SHAMASH_RISE = 32;
const CANDLE_H = 38;

/** The rangoli's middle on the ground, and where the three diyas stand on it. */
const RANGOLI_X = 1040;
const DIYAS_X = [950, 1040, 1130];

/** The string of lights: where it is hooked up, and how low each swag hangs (the control point's y). */
const HOOKS = [-20, 400, 800, 1220];
const HOOK_Y = 24;
const SAG_Y = 96;

/** Where the lantern hangs: how far along the third swag. */
const LANTERN_T = 0.6;

const f = (n: number) => Number(n.toFixed(1));

/** The scene's paints, by name, used as classes. */
const PAINT = {
  ink: "stroke: var(--stage-deep); stroke-opacity: 0.55; stroke-width: 4; stroke-linejoin: round",
  "ink-soft": "stroke: var(--stage-deep); stroke-opacity: 0.35; stroke-width: 3; stroke-linejoin: round",
  "c-gold": "fill: var(--gold)",
  "c-brass": "fill: var(--brass)",
  "c-fg": "fill: var(--stage-fg)",
  "c-mint": "fill: var(--mint)",
  "c-deep": "fill: var(--stage-deep)",
  "c-panel": "fill: var(--stage-panel); fill-opacity: 0.7",
  // Not site tokens: the lantern's red paper, the diyas' fired clay, the
  // rangoli's magenta and orange, and the blue and red of the bulbs.
  "c-red": "fill: #d4473a",
  "c-clay": "fill: #b8592c",
  "c-clay-dark": "fill: #7d3a1c",
  "c-magenta": "fill: #c8367c",
  "c-orange": "fill: #ec7d2a",
  "c-blue": "fill: #5d9ad8",
};
type Paint = keyof typeof PAINT;

/** The four bulb colors, in the order they repeat along the string. */
const BULBS: { paint: Paint; glow: string }[] = [
  { paint: "c-gold", glow: "var(--gold)" },
  { paint: "c-red", glow: "#d4473a" },
  { paint: "c-mint", glow: "var(--mint)" },
  { paint: "c-blue", glow: "#5d9ad8" },
];

/** A point on swag `k` (between HOOKS[k] and HOOKS[k + 1]) at t. */
function onSwag(k: number, t: number): [number, number] {
  const [x0, x1] = [HOOKS[k], HOOKS[k + 1]];
  const u = 1 - t;
  return [f(u * u * x0 + 2 * u * t * ((x0 + x1) / 2) + t * t * x1), f(u * u * HOOK_Y + 2 * u * t * SAG_Y + t * t * HOOK_Y)];
}

/** One bulb hanging from its socket at (x, y), tipped `tilt` degrees, with its glow; the two dim and brighten together. */
function bulb(x: number, y: number, tilt: number, n: number, delay: number): string {
  const { paint } = BULBS[n % BULBS.length];
  return `<g transform="translate(${x} ${y}) rotate(${tilt})"><g class="twinkle" style="--delay:${f(delay)}s">
    <circle cy="20" r="24" fill="url(#hd-glow-${n % BULBS.length})"/>
    <path d="M -7 8 C -10 18, -6 28, 0 32 C 6 28, 10 18, 7 8 Z" class="${paint} ink-soft"/>
    <rect x="-5.5" y="0" width="11" height="10" rx="2" class="c-brass ink-soft"/>
  </g></g>`;
}

/** The string across the top: three swags and sixteen bulbs. */
function lights(): string {
  const wire = HOOKS.slice(0, -1)
    .map((x0, k) => `M ${x0} ${HOOK_Y} Q ${(x0 + HOOKS[k + 1]) / 2} ${SAG_Y} ${HOOKS[k + 1]} ${HOOK_Y}`)
    .join(" ");
  const counts = [5, 6, 5];
  let n = 0;
  const bulbs = counts.flatMap((count, k) =>
    Array.from({ length: count }, (_, i) => {
      const [x, y] = onSwag(k, (i + 0.5) / count);
      const out = bulb(x, y, n % 2 === 0 ? -10 : 10, n, (n * 0.71) % 2.8);
      n++;
      return out;
    }),
  );
  return `<path d="${wire}" class="wire"/>${bulbs.join("")}`;
}

/** A candle flame with its glow, its base at the origin. */
function flame(scale: number): string {
  return `<g transform="scale(${scale})">
    <circle cy="-14" r="30" fill="url(#hd-glow-0)"/>
    <path d="M 0 0 C -10 -4, -10 -17, 0 -30 C 10 -17, 10 -4, 0 0 Z" class="c-gold ink-soft"/>
    <path d="M 0 -2 C -5 -4, -5 -11, 0 -18 C 5 -11, 5 -4, 0 -2 Z" class="c-fg"/>
  </g>`;
}

/** Where each of the nine candles stands, left to right, as [x, cup top y]; the fifth is the shamash. */
function candleSpots(): [number, number][] {
  const row = [-4, -3, -2, -1, 1, 2, 3, 4].map((i): [number, number] => [MENORAH_X + i * SPACING, CUP_Y]);
  return [...row.slice(0, 4), [MENORAH_X, CUP_Y - SHAMASH_RISE], ...row.slice(4)];
}

/**
 * The menorah, without its flames: a foot, a stem up the middle to the
 * shamash, four arms curving down from each pair of cups, a cup on each arm and
 * a candle in each cup.
 */
function menorah(): string {
  const arms = [1, 2, 3, 4]
    .map((k) => {
      const r = k * SPACING;
      return `M ${MENORAH_X - r} ${CUP_Y} A ${r} ${r} 0 0 0 ${MENORAH_X + r} ${CUP_Y}`;
    })
    .join(" ");
  const stem = `M ${MENORAH_X} ${CUP_Y - SHAMASH_RISE} L ${MENORAH_X} ${GROUND - 26}`;
  const cups = candleSpots()
    .map(([x, y]) => `<rect x="${x - 10}" y="${y - 8}" width="20" height="10" rx="3" class="c-gold ink-soft"/>`)
    .join("");
  const candles = candleSpots()
    .map(
      ([x, y]) =>
        `<rect x="${x - 5}" y="${y - 8 - CANDLE_H}" width="10" height="${CANDLE_H}" rx="2" class="candle c-fg ink-soft"/><path d="M ${x} ${y - 8 - CANDLE_H} L ${x} ${y - 13 - CANDLE_H}" class="wick"/>`,
    )
    .join("");
  return `<circle cx="${MENORAH_X}" cy="${CUP_Y - 10}" r="200" fill="url(#hd-halo)"/>
  <path d="${arms} ${stem}" class="metal-edge"/>
  <path d="${arms} ${stem}" class="metal"/>
  <path d="M ${MENORAH_X - 46} ${GROUND} L ${MENORAH_X - 24} ${GROUND - 28} L ${MENORAH_X + 24} ${GROUND - 28} L ${MENORAH_X + 46} ${GROUND} Z" class="c-brass ink"/>
  ${cups}
  ${candles}`;
}

/** The nine flames, one on each candle. */
function menorahFlames(): string {
  return candleSpots()
    .map(
      ([x, y], i) =>
        `<g transform="translate(${x} ${y - 11 - CANDLE_H})"><g class="flicker menorah-flame" style="--dur:${f(1.1 + ((i * 0.37) % 0.6))}s;--delay:${f((i * 0.23) % 1)}s">${flame(0.65)}</g></g>`,
    )
    .join("");
}

/**
 * The rangoli: a ring of magenta petals, a ring of orange dots and a gold
 * middle, drawn round and then flattened onto the ground.
 */
function rangoli(): string {
  const petals = Array.from({ length: 16 }, (_, i) => {
    const deg = i * 22.5;
    return `<ellipse cx="0" cy="-96" rx="13" ry="24" transform="rotate(${deg})" class="c-magenta"/>`;
  }).join("");
  const dots = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    return `<circle cx="${f(Math.cos(a) * 62)}" cy="${f(Math.sin(a) * 62)}" r="11" class="c-orange"/>`;
  }).join("");
  return `<g transform="translate(${RANGOLI_X} ${GROUND + 4}) scale(1.25 0.25)">
    <circle r="124" class="c-fg" opacity="0.18"/>
    ${petals}${dots}
    <circle r="40" class="c-gold"/>
    <circle r="16" class="c-mint"/>
  </g>`;
}

/** One diya without its flame, standing at x: a clay bowl with its lip pinched up in front, oil inside, and a painted band. */
function diya(x: number): string {
  const dots = [-18, -6, 6, 18].map((dx) => `<circle cx="${dx}" cy="-12" r="2.6" class="c-gold"/>`).join("");
  return `<g transform="translate(${x} ${GROUND}) scale(1.2)">
    <path d="M -36 -24 C -32 -2, 32 -2, 36 -24 Z" class="c-clay ink"/>
    <path d="M -33 -16 C -20 -10, 20 -10, 33 -16" class="paint"/>
    ${dots}
    <ellipse cx="0" cy="-24" rx="36" ry="7" class="c-clay-dark ink-soft"/>
    <path d="M -9 -25 Q 0 -27 0 -36 Q 0 -27 9 -25 Z" class="c-clay ink-soft"/>
    <path d="M 0 -35 L 0 -40" class="wick"/>
  </g>`;
}

/** The diyas, on their rangoli, with the glow they cast. */
function diyas(): string {
  return `<ellipse cx="${RANGOLI_X}" cy="${GROUND - 40}" rx="200" ry="110" fill="url(#hd-halo)"/>
  ${rangoli()}
  ${DIYAS_X.map(diya).join("")}`;
}

/** The three diyas' flames, one at each lip. */
function diyaFlames(): string {
  return DIYAS_X.map(
    (x, i) =>
      `<g transform="translate(${x} ${GROUND - 48})"><g class="flicker diya-flame" style="--dur:${f(1.3 + i * 0.17)}s;--delay:${f(0.2 + i * 0.31)}s">${flame(0.9)}</g></g>`,
  ).join("");
}

/** The red paper lantern on its cord, hanging from the string; it sways from the point where it hangs. */
function lantern(): string {
  const [x, y] = onSwag(2, LANTERN_T);
  const tassel = [-8, -4, 0, 4, 8].map((dx) => `M ${dx * 0.4} 250 L ${dx} 300`).join(" ");
  return `<g transform="translate(${x} ${y})"><g class="swing">
    <path d="M 0 0 L 0 98" class="cord"/>
    <ellipse cx="0" cy="168" rx="72" ry="62" class="c-red ink"/>
    <ellipse cx="0" cy="168" rx="60" ry="52" fill="url(#hd-lantern)"/>
    <path d="M 0 106 L 0 230 M -24 108 C -46 140, -46 196, -24 228 M 24 108 C 46 140, 46 196, 24 228 M -48 120 C -68 148, -68 188, -48 216 M 48 120 C 68 148, 68 188, 48 216" class="rib"/>
    <rect x="-32" y="96" width="64" height="16" rx="4" class="c-gold ink-soft"/>
    <rect x="-32" y="224" width="64" height="16" rx="4" class="c-gold ink-soft"/>
    <circle cx="0" cy="248" r="6" class="c-gold ink-soft"/>
    <path d="${tassel}" class="tassel"/>
  </g></g>`;
}

/** The glow behind "trivia": a blurred copy, drawn once on the still layer. */
function triviaGlow(): string {
  return `<text x="${WORDS_X}" y="${LINE_2_Y}" class="word c-gold" filter="url(#hd-blur)" opacity="0.65">trivia</text>`;
}

/** "Holiday" in cream, then "trivia" in gold with a hop running through its letters. */
function words(): string {
  // Each letter is drawn with the middle of its foot at the origin, so it hops and tips from there.
  const letters = "trivia".split("").map((ch, i) => {
    const half = (TRIVIA_ADVANCES[i + 1] - TRIVIA_ADVANCES[i]) / 2;
    return `<g transform="translate(${f(WORDS_X + TRIVIA_ADVANCES[i] + half)} ${LINE_2_Y})"><g class="hop" style="--delay:${f(i * 0.11)}s"><text x="${f(-half)}" class="word c-gold">${ch}</text></g></g>`;
  });
  return `<text x="${WORDS_X}" y="${LINE_1_Y}" class="word c-fg">Holiday</text>
  ${letters.join("")}`;
}

/** The still layer: the room, the ground, the menorah, the diyas and the glow. Nothing here moves. */
const back = `<defs>
  <linearGradient id="hd-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--stage)"/>
    <stop offset="1" style="stop-color:var(--stage-deep)"/>
  </linearGradient>
  <radialGradient id="hd-overhead" cx="360" cy="-63" r="840" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 -37.2) scale(1 0.41)">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.22"/>
    <stop offset="0.62" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <pattern id="hd-dots" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" style="fill:var(--stage-fg)" fill-opacity="0.06"/>
  </pattern>
  <radialGradient id="hd-halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.3"/>
    <stop offset="1" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <filter id="hd-blur" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="12"/>
  </filter>
</defs>
<rect width="1200" height="630" fill="url(#hd-sky)"/>
<rect width="1200" height="630" fill="url(#hd-overhead)"/>
<rect width="1200" height="630" fill="url(#hd-dots)"/>
<path d="M 0 588 Q 300 566 600 586 T 1200 580 L 1200 630 L 0 630 Z" class="c-panel"/>
${menorah()}
${diyas()}
${triviaGlow()}
<rect y="620" width="1200" height="10" class="c-brass"/>`;

/** The moving layer, over the still one: the lights, the lantern, the flames and the words. */
const front = `<defs>
  ${BULBS.map(
    ({ glow }, i) => `<radialGradient id="hd-glow-${i}" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:${glow}" stop-opacity="0.55"/>
    <stop offset="1" style="stop-color:${glow}" stop-opacity="0"/>
  </radialGradient>`,
  ).join("")}
  <radialGradient id="hd-lantern" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.6"/>
    <stop offset="1" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
</defs>
${lantern()}
${lights()}
${menorahFlames()}
${diyaFlames()}
${words()}`;

const css = `
${Object.entries(PAINT)
  .map(([name, rules]) => `${ROOT} .${name} { ${rules}; }`)
  .join("\n")}
${ROOT} .wire { fill: none; stroke: var(--stage-deep); stroke-width: 4; stroke-linecap: round; }
${ROOT} .cord { fill: none; stroke: var(--brass); stroke-width: 3; }
${ROOT} .rib { fill: none; stroke: #8f2a20; stroke-opacity: 0.7; stroke-width: 3; }
${ROOT} .tassel { fill: none; stroke: var(--gold); stroke-width: 3; stroke-linecap: round; }
${ROOT} .paint { fill: none; stroke: #c8367c; stroke-width: 4; stroke-linecap: round; }
${ROOT} .wick { fill: none; stroke: var(--stage-deep); stroke-width: 2.5; stroke-linecap: round; }
${ROOT} .metal { fill: none; stroke: var(--brass); stroke-width: 7; stroke-linecap: round; }
${ROOT} .metal-edge { fill: none; stroke: var(--stage-deep); stroke-opacity: 0.55; stroke-width: 12; stroke-linecap: round; }
${ROOT} .word { font-family: var(--font-display), "Rockwell Extra Bold", Georgia, serif; font-size: 96px; }

${ROOT} .twinkle { animation: hd-twinkle 2.8s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes hd-twinkle { 50% { opacity: 0.4; } }
${ROOT} .flicker { animation: hd-flicker var(--dur) ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes hd-flicker {
  25% { transform: scale(0.94, 1.08) rotate(-2deg); }
  50% { transform: scale(1.05, 0.95); }
  75% { transform: scale(0.97, 1.04) rotate(3deg); }
}
${ROOT} .swing { animation: hd-swing 5s ease-in-out var(--start) infinite; }
@keyframes hd-swing {
  25% { transform: rotate(3deg); }
  75% { transform: rotate(-3deg); }
}
${ROOT} .hop { animation: hd-hop 4s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes hd-hop {
  0%, 30%, 100% { transform: none; }
  8% { transform: translateY(-14px) rotate(-6deg); }
  16% { transform: none; }
  23% { transform: translateY(-6px) rotate(4deg); }
}
`;

export const holidayTriviaScene: AnimatedScene = { back, front, css };
