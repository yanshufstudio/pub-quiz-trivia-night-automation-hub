import type { AnimatedScene } from "./index";

/**
 * Chanukah: a lit hanukkiah (eight candles in a row and the shamash, the
 * helper candle, standing higher in the middle), a dreidel, gold chocolate
 * coins (gelt) and a plate of jam doughnuts, and a hop running through
 * "trivia". The flames flicker and the dreidel rocks on its point while its
 * face turns through nun, gimel, hei and shin, the four letters every dreidel
 * outside Israel carries. No figures, no other symbols.
 *
 * Coordinates are in the 1200x630 viewBox. Each moving shape is drawn at its
 * still-frame position and every animation starts from there, after
 * var(--start), so the page first shows the frame the PNG shows and then comes
 * to life.
 */

const ROOT = ".quiz-scene-chanukah";

/** Where the hanukkiah, the dreidel, the coins and the plate stand. */
const GROUND = 590;

/** "Chanukah trivia" in the display face at 96px: where each line starts, and where each letter of "trivia" starts, then where the word ends (measured in Chromium with src/fonts/alfa-slab-one). */
const WORDS_X = 72;
const LINE_1_Y = 205;
const LINE_2_Y = 395;
const TRIVIA_ADVANCES = [0, 43.3, 93.9, 127.1, 189.6, 222.8, 281.9];

/** The hanukkiah: its middle, the height of the eight cups, how far apart the candles are, and how much higher the shamash's cup is. */
const MENORAH_X = 830;
const CUP_Y = 372;
const SPACING = 30;
const SHAMASH_RISE = 40;
const CANDLE_H = 44;

/** Where the dreidel's point touches the table, and the plate's middle. */
const DREIDEL_X = 545;
const PLATE_X = 1075;

/** How long the dreidel shows each face before it turns to the next. */
const FACE_S = 2;

const f = (n: number) => Number(n.toFixed(1));

/** The scene's paints, by name, used as classes. */
const PAINT = {
  ink: "stroke: var(--stage-deep); stroke-opacity: 0.55; stroke-width: 4; stroke-linejoin: round",
  "ink-soft": "stroke: var(--stage-deep); stroke-opacity: 0.35; stroke-width: 3; stroke-linejoin: round",
  "c-gold": "fill: var(--gold)",
  "c-brass": "fill: var(--brass)",
  "c-fg": "fill: var(--stage-fg)",
  "c-panel": "fill: var(--stage-panel); fill-opacity: 0.7",
  // Not site tokens: the dreidel's blue, the doughnuts' fried dough, and the jam.
  "c-blue": "fill: #5d9ad8",
  "c-blue-dark": "fill: #3f73ab",
  "c-blue-top": "fill: #8bb8e6",
  "c-dough": "fill: #c98a3e",
  "c-dough-dark": "fill: #9c6127",
  "c-jam": "fill: #b3263a",
};

/** A candle flame with its glow, its base at the origin. */
function flame(scale: number): string {
  return `<g transform="scale(${scale})">
    <circle cy="-14" r="30" fill="url(#ch-glow)"/>
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
 * The hanukkiah, without its flames: a foot, a stem up the middle to the
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
  const stem = `M ${MENORAH_X} ${CUP_Y - SHAMASH_RISE} L ${MENORAH_X} ${GROUND - 30}`;
  const cups = candleSpots()
    .map(([x, y]) => `<rect x="${x - 11}" y="${y - 9}" width="22" height="11" rx="3" class="c-gold ink-soft"/>`)
    .join("");
  const candles = candleSpots()
    .map(
      ([x, y]) =>
        `<rect x="${x - 5.5}" y="${y - 9 - CANDLE_H}" width="11" height="${CANDLE_H}" rx="2" class="c-fg ink-soft"/><path d="M ${x} ${y - 9 - CANDLE_H} L ${x} ${y - 14 - CANDLE_H}" class="wick"/>`,
    )
    .join("");
  return `<circle cx="${MENORAH_X}" cy="${CUP_Y - 20}" r="230" fill="url(#ch-halo)"/>
  <path d="${arms} ${stem}" class="metal-edge"/>
  <path d="${arms} ${stem}" class="metal"/>
  <path d="M ${MENORAH_X - 52} ${GROUND} L ${MENORAH_X - 26} ${GROUND - 32} L ${MENORAH_X + 26} ${GROUND - 32} L ${MENORAH_X + 52} ${GROUND} Z" class="c-brass ink"/>
  ${cups}
  ${candles}`;
}

/** The nine flames, one on each candle. */
function menorahFlames(): string {
  return candleSpots()
    .map(
      ([x, y], i) =>
        `<g transform="translate(${x} ${y - 12 - CANDLE_H})"><g class="flicker" style="--dur:${f(1.1 + ((i * 0.37) % 0.6))}s;--delay:${f((i * 0.23) % 1)}s">${flame(0.75)}</g></g>`,
    )
    .join("");
}

/** One coin lying flat at (x, y): gold foil, a rim pressed into it. */
function flatCoin(x: number, y: number): string {
  return `<ellipse cx="${x}" cy="${y + 4}" rx="30" ry="9" class="c-brass ink-soft"/>
  <ellipse cx="${x}" cy="${y}" rx="30" ry="9" class="c-gold ink-soft"/>
  <ellipse cx="${x}" cy="${y}" rx="21" ry="6" class="rim"/>`;
}

/** One coin standing on its edge at x, a little turned. */
function standingCoin(x: number): string {
  return `<g transform="translate(${x} ${GROUND - 32})">
    <ellipse cx="4" rx="27" ry="32" class="c-brass ink-soft"/>
    <ellipse rx="27" ry="32" class="c-gold ink-soft"/>
    <ellipse rx="19" ry="23" class="rim"/>
    <circle r="7" class="c-brass"/>
  </g>`;
}

/** The gelt: a few coins scattered, a short stack, and one standing up. */
function gelt(): string {
  const stack = [0, 1, 2].map((k) => flatCoin(250, GROUND - 6 - k * 9)).join("");
  return `${flatCoin(140, GROUND - 8)}${flatCoin(196, GROUND + 4)}${stack}${flatCoin(330, GROUND - 2)}${flatCoin(420, GROUND + 6)}${standingCoin(372)}`;
}

/** A jam doughnut at (x, y): fried dough, a dusting of sugar on top, and the jam showing where it was filled. */
function doughnut(x: number, y: number): string {
  return `<g transform="translate(${x} ${y})">
    <ellipse rx="50" ry="36" class="c-dough ink"/>
    <path d="M -46 8 C -30 30, 30 30, 46 8 C 30 22, -30 22, -46 8 Z" class="c-dough-dark"/>
    <path d="M -34 -20 C -22 -36, 22 -38, 36 -20 C 26 -10, 14 -16, 4 -10 C -8 -16, -22 -8, -34 -20 Z" class="c-fg" opacity="0.85"/>
    <path d="M 26 -6 C 34 -10, 42 -4, 40 4 C 39 9, 35 10, 34 16 C 32 12, 30 10, 27 8 C 21 5, 20 -3, 26 -6 Z" class="c-jam ink-soft"/>
  </g>`;
}

/** The plate of doughnuts: two side by side and one on top. */
function plate(): string {
  return `<ellipse cx="${PLATE_X}" cy="${GROUND - 4}" rx="118" ry="22" class="c-fg ink-soft" opacity="0.9"/>
  <ellipse cx="${PLATE_X}" cy="${GROUND - 8}" rx="84" ry="13" class="plate-well"/>
  ${doughnut(PLATE_X - 46, GROUND - 38)}
  ${doughnut(PLATE_X + 46, GROUND - 38)}
  ${doughnut(PLATE_X, GROUND - 84)}`;
}

/**
 * The four letters on a dreidel's faces, as block strokes in a 32-unit box
 * around the origin: nun, gimel, hei, shin. Drawn, not typed, so the picture
 * never depends on a Hebrew font being installed.
 */
const LETTERS = [
  // Nun: a short head, a stroke down the right, a base running left.
  "M -3 -16 L 4 -16 L 4 16 L -10 16",
  // Gimel: a short head, a stroke down the right, a foot kicking down to the left.
  "M -5 -16 L 3 -16 L 5 16 M 4 4 L -7 16",
  // Hei: a roof and a right side, and a left leg that does not touch the roof.
  "M -12 -16 L 11 -16 L 11 16 M -10 -5 L -10 16",
  // Shin: three arms rising from a flat base.
  "M -13 -16 L -9 16 L 12 16 L 12 -16 M -1 -15 L 3 16",
];

/**
 * The dreidel, with its point at the origin: a handle, a blue body with a gold
 * letter on the face we see, and a point. It rocks on the point; its face
 * shows each letter in turn, narrowing between them as if it turned.
 */
function dreidel(): string {
  const faces = LETTERS.map(
    (d, i) =>
      `<path d="${d}" class="letter face" style="--delay:${i * FACE_S}s"${i === 0 ? "" : ' opacity="0"'}/>`,
  ).join("");
  return `<g transform="translate(${DREIDEL_X} ${GROUND})"><g class="spin">
    <ellipse cx="6" cy="0" rx="36" ry="6" class="c-deep-shadow"/>
    <path d="M 40 -142 L 54 -154 L 54 -76 C 50 -48, 20 -14, 0 0 C 14 -12, 38 -36, 40 -62 Z" class="c-blue-dark ink"/>
    <path d="M -40 -62 L 40 -62 C 38 -36, 12 -8, 0 0 C -12 -8, -38 -36, -40 -62 Z" class="c-blue-dark ink"/>
    <rect x="-40" y="-142" width="80" height="80" class="c-blue ink"/>
    <path d="M -40 -142 L 40 -142 L 54 -154 L -26 -154 Z" class="c-blue-top ink-soft"/>
    <rect x="0" y="-194" width="14" height="46" rx="5" class="c-brass ink-soft"/>
    <circle cx="7" cy="-196" r="9" class="c-gold ink-soft"/>
    <g transform="translate(0 -102) scale(1.45)"><g class="turn" style="--every:${FACE_S}s">${faces}</g></g>
  </g></g>`;
}

/** The glow behind "trivia": a blurred copy, drawn once on the still layer. */
function triviaGlow(): string {
  return `<text x="${WORDS_X}" y="${LINE_2_Y}" class="word c-gold" filter="url(#ch-blur)" opacity="0.65">trivia</text>`;
}

/** "Chanukah" in cream, then "trivia" in gold with a hop running through its letters. */
function words(): string {
  // Each letter is drawn with the middle of its foot at the origin, so it hops and tips from there.
  const letters = "trivia".split("").map((ch, i) => {
    const half = (TRIVIA_ADVANCES[i + 1] - TRIVIA_ADVANCES[i]) / 2;
    return `<g transform="translate(${f(WORDS_X + TRIVIA_ADVANCES[i] + half)} ${LINE_2_Y})"><g class="hop" style="--delay:${f(i * 0.11)}s"><text x="${f(-half)}" class="word c-gold">${ch}</text></g></g>`;
  });
  return `<text x="${WORDS_X}" y="${LINE_1_Y}" class="word c-fg">Chanukah</text>
  ${letters.join("")}`;
}

/** The still layer: the room, the table, the hanukkiah, the gelt, the plate and the glow. Nothing here moves. */
const back = `<defs>
  <linearGradient id="ch-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--stage)"/>
    <stop offset="1" style="stop-color:var(--stage-deep)"/>
  </linearGradient>
  <radialGradient id="ch-overhead" cx="360" cy="-63" r="840" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 -37.2) scale(1 0.41)">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.22"/>
    <stop offset="0.62" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <pattern id="ch-dots" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" style="fill:var(--stage-fg)" fill-opacity="0.06"/>
  </pattern>
  <radialGradient id="ch-halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.3"/>
    <stop offset="1" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <filter id="ch-blur" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="12"/>
  </filter>
</defs>
<rect width="1200" height="630" fill="url(#ch-sky)"/>
<rect width="1200" height="630" fill="url(#ch-overhead)"/>
<rect width="1200" height="630" fill="url(#ch-dots)"/>
<path d="M 0 588 Q 300 566 600 586 T 1200 580 L 1200 630 L 0 630 Z" class="c-panel"/>
${menorah()}
${gelt()}
${plate()}
${triviaGlow()}
<rect y="620" width="1200" height="10" class="c-brass"/>`;

/** The moving layer, over the still one: the flames, the dreidel and the words. */
const front = `<defs>
  <radialGradient id="ch-glow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.55"/>
    <stop offset="1" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
</defs>
${menorahFlames()}
${dreidel()}
${words()}`;

const css = `
${Object.entries(PAINT)
  .map(([name, rules]) => `${ROOT} .${name} { ${rules}; }`)
  .join("\n")}
${ROOT} .c-deep-shadow { fill: var(--stage-deep); fill-opacity: 0.5; }
${ROOT} .wick { fill: none; stroke: var(--stage-deep); stroke-width: 2.5; stroke-linecap: round; }
${ROOT} .metal { fill: none; stroke: var(--brass); stroke-width: 8; stroke-linecap: round; }
${ROOT} .metal-edge { fill: none; stroke: var(--stage-deep); stroke-opacity: 0.55; stroke-width: 13; stroke-linecap: round; }
${ROOT} .rim { fill: none; stroke: var(--brass); stroke-width: 2.5; }
${ROOT} .plate-well { fill: none; stroke: var(--stage-deep); stroke-opacity: 0.18; stroke-width: 3; }
${ROOT} .letter { fill: none; stroke: var(--gold); stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; }
${ROOT} .word { font-family: var(--font-display), "Rockwell Extra Bold", Georgia, serif; font-size: 96px; }

${ROOT} .flicker { animation: ch-flicker var(--dur) ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes ch-flicker {
  25% { transform: scale(0.94, 1.08) rotate(-2deg); }
  50% { transform: scale(1.05, 0.95); }
  75% { transform: scale(0.97, 1.04) rotate(3deg); }
}
${ROOT} .spin { animation: ch-spin 4s ease-in-out var(--start) infinite; }
@keyframes ch-spin {
  25% { transform: rotate(4deg); }
  75% { transform: rotate(-4deg); }
}
${ROOT} .face { animation: ch-face ${4 * FACE_S}s step-end calc(var(--start) + var(--delay)) infinite; }
@keyframes ch-face {
  0% { opacity: 1; }
  25%, 100% { opacity: 0; }
}
${ROOT} .turn { animation: ch-turn var(--every) ease-in-out calc(var(--start) + var(--every) / 2) infinite; }
@keyframes ch-turn {
  0%, 30%, 70%, 100% { transform: none; }
  50% { transform: scaleX(0.1); }
}
${ROOT} .hop { animation: ch-hop 4s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes ch-hop {
  0%, 30%, 100% { transform: none; }
  8% { transform: translateY(-14px) rotate(-6deg); }
  16% { transform: none; }
  23% { transform: translateY(-6px) rotate(4deg); }
}
`;

export const chanukahScene: AnimatedScene = { back, front, css };
