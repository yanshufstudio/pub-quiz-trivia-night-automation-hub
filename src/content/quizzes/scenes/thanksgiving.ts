import type { AnimatedScene } from "./index";

/**
 * Thanksgiving: three wild turkeys trotting along the bottom, maple leaves
 * drifting down, the pumpkin pie with its ring of piped cream, and the words in
 * decorated letters (a leaf garland under "Thanksgiving", a hop running
 * through "trivia").
 *
 * Coordinates are in the 1200x630 viewBox. Each moving shape is drawn at its
 * still-frame position and every animation starts from there, after
 * var(--start), so the page first shows the frame the PNG shows and then comes
 * to life.
 */

const ROOT = ".quiz-scene-thanksgiving";

/** Where the turkeys' feet are. */
const GROUND = 596;

/** "Thanksgiving trivia" in the display face at 96px: where each line starts, and where each letter of "trivia" starts, then where the word ends (measured in Chromium with src/fonts/alfa-slab-one). */
const WORDS_X = 72;
const LINE_1_Y = 205;
const LINE_2_Y = 395;
const TRIVIA_ADVANCES = [0, 43.3, 93.9, 127.1, 189.6, 222.8, 281.9];
const LINE_1_WIDTH = 704;

const f = (n: number) => Number(n.toFixed(1));

/**
 * The scene's paints, by name. Shapes outside <defs> use them as classes; the
 * shapes reused with <use> carry them as inline styles, because a page's
 * stylesheet does not reach inside a <use> copy.
 */
const PAINT = {
  ink: "stroke: var(--stage-deep); stroke-opacity: 0.55; stroke-width: 4; stroke-linejoin: round",
  "ink-soft": "stroke: var(--stage-deep); stroke-opacity: 0.35; stroke-width: 3; stroke-linejoin: round",
  stem: "fill: none; stroke-linecap: round",
  "leg-line": "fill: none; stroke: var(--gold); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round",
  "c-gold": "fill: var(--gold)",
  "c-brass": "fill: var(--brass)",
  "c-amber": "fill: var(--amber)",
  "c-fg": "fill: var(--stage-fg)",
  "c-deep": "fill: var(--stage-deep)",
  "c-panel": "fill: var(--stage-panel); fill-opacity: 0.7",
  // Not site tokens: pumpkin orange, and a wild turkey's red head, dark
  // bronze body and feathers, and the blue round its eye.
  "c-pumpkin": "fill: #d96f1c",
  "c-red": "fill: #c8402a",
  "c-dark": "fill: #3b2a1e",
  "c-bronze": "fill: #80592f",
  "c-blue": "fill: #a9c1d6",
};
type Paint = keyof typeof PAINT;

/** The paints as an inline style, for shapes inside <defs>. */
function paint(...names: Paint[]): string {
  return `style="${names.map((n) => PAINT[n]).join("; ")}"`;
}

/** A point `r` from (cx, cy) at `deg` degrees clockwise from 3 o'clock. */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [f(cx + Math.cos(a) * r), f(cy + Math.sin(a) * r)];
}

/** A pie of radius `r` with the slice from `cut[0]` to `cut[1]` degrees missing. */
function pieShape(cx: number, cy: number, r: number, cut: [number, number]): string {
  return `M ${cx} ${cy} L ${polar(cx, cy, r, cut[1]).join(",")} A ${r} ${r} 0 1 1 ${polar(cx, cy, r, cut[0] + 360).join(",")} Z`;
}

/** A pumpkin pie seen from above with one slice cut out, crust radius `r`, centred on (cx, cy). */
function pie(cx: number, cy: number, r: number): string {
  const cut: [number, number] = [-70, -25];
  const k = r / 168;
  const scallops: string[] = [];
  for (let deg = cut[1] + 8; deg <= cut[0] + 360 - 8; deg += 15) {
    const [x, y] = polar(cx, cy, r - 6 * k, deg);
    scallops.push(`<circle cx="${x}" cy="${y}" r="${f(15 * k)}"/>`);
  }
  // Piped cream: small drops in a ring round the filling, none on the cut slice.
  const drops: string[] = [];
  for (let deg = cut[1] + 22; deg <= cut[0] + 360 - 10; deg += 30) {
    const [x, y] = polar(cx, cy, (r - 30 * k) * 0.72, deg);
    drops.push(`<g transform="translate(${x} ${y}) scale(${f(k * 1.1)})"><path d="M 0 -14 C 4 -6, 12 -2, 12 5 C 12 11, 6 14, 0 14 C -6 14, -12 11, -12 5 C -12 -2, -4 -6, 0 -14 Z" class="c-fg ink-soft"/><path d="M -6 6 Q 0 2 6 6" class="crease"/></g>`);
  }
  return `<circle cx="${cx}" cy="${cy}" r="${f(340 * k)}" fill="url(#tg-halo)"/>
  <path d="${pieShape(cx, cy, r, cut)}" class="c-brass ink"/>
  <g class="c-brass ink">${scallops.join("")}</g>
  <path d="${pieShape(cx, cy, f(r - 30 * k), cut)}" class="c-pumpkin ink"/>
  <path d="${pieShape(cx, cy, f(r - 30 * k), cut)}" fill="url(#tg-baked)"/>
  ${drops.join("")}`;
}

/**
 * One maple leaf, about 40 across, centred on the origin with its stem sticking
 * out at the top (drawn stem-down, then turned); drawn once and reused. Maple,
 * not a plain oval, so it never reads as one of the turkeys' feathers.
 */
const LEAF = `<g id="tg-leaf" transform="rotate(180) scale(1.05)"><path d="M 0 12 L 4 11 L 13 14 L 10 7 L 20 3 L 16 0 L 19 -9 L 12 -7 L 10 -12 L 6 -9 L 5 -15 L 0 -21 L -5 -15 L -6 -9 L -10 -12 L -12 -7 L -19 -9 L -16 0 L -20 3 L -10 7 L -13 14 L -4 11 Z" ${paint("ink")}/><path d="M 0 22 L 0 -15 M 0 6 L 15 -6 M 0 6 L -15 -6 M 0 9 L 15 3 M 0 9 L -15 3" ${paint("ink", "stem")}/></g>`;

/** The leaf, `len` long, in `color` (a c-* class). */
function leaf(len: number, color: Paint): string {
  return `<use href="#tg-leaf" class="${color}" transform="scale(${f(len / 40)})"/>`;
}

/** The garland under "Thanksgiving": a sagging vine with leaves hanging off it, each swaying. */
function garland(): string {
  const [x0, x1, y0] = [WORDS_X + 6, WORDS_X + LINE_1_WIDTH - 6, 238];
  const sag = 278; // the control point's y; the vine's lowest point is halfway to it
  const at = (t: number): [number, number] => [
    f((1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2) + t * t * x1),
    f((1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * sag + t * t * y0),
  ];
  const colors: Paint[] = ["c-gold", "c-pumpkin", "c-brass"];
  const leaves: string[] = [];
  const count = 11;
  for (let i = 0; i < count; i++) {
    const [x, y] = at((i + 0.5) / count);
    const len = i % 2 === 0 ? 42 : 36;
    const tilt = i % 2 === 0 ? -14 : 14;
    leaves.push(`<g transform="translate(${x} ${y}) rotate(${tilt})"><g class="dangle" style="--delay:${f(i * 0.37)}s">
      <g transform="translate(0 ${f(len / 2 + len * 0.16)})">${leaf(len, colors[i % 3])}</g></g></g>`);
  }
  const berries = [0.04, 0.96].map((t) => {
    const [x, y] = at(t);
    return `<circle cx="${x}" cy="${y}" r="7" class="c-red ink-soft"/>`;
  });
  return `<path d="M ${x0} ${y0} Q ${(x0 + x1) / 2} ${sag} ${x1} ${y0}" class="vine"/>${leaves.join("")}${berries.join("")}`;
}

/** The glow behind "trivia": a blurred copy, drawn once on the still layer. */
function triviaGlow(): string {
  return `<text x="${WORDS_X}" y="${LINE_2_Y}" class="word c-gold" filter="url(#tg-glow)" opacity="0.65">trivia</text>`;
}

/** "Thanksgiving" in cream, then "trivia" in gold with a hop running through its letters. */
function words(): string {
  // Each letter is drawn with the middle of its foot at the origin, so it hops and tips from there.
  const letters = "trivia".split("").map((ch, i) => {
    const half = (TRIVIA_ADVANCES[i + 1] - TRIVIA_ADVANCES[i]) / 2;
    return `<g transform="translate(${f(WORDS_X + TRIVIA_ADVANCES[i] + half)} ${LINE_2_Y})"><g class="hop" style="--delay:${f(i * 0.11)}s"><text x="${f(-half)}" class="word c-gold">${ch}</text></g></g>`;
  });
  return `<text x="${WORDS_X}" y="${LINE_1_Y}" class="word c-fg">Thanksgiving</text>
  ${garland()}
  ${letters.join("")}`;
}

/** A wild turkey from plain shapes, facing right, without its legs, feet at the origin; drawn once and reused. */
function turkeyBody(): string {
  // Tail feathers: cream underneath shows as a tip band, with a dark bar across each.
  const tail = (rx: number, ry: number, colors: Paint[], from: number, to: number) =>
    colors
      .map((c, i) => {
        const deg = f(from + ((to - from) * i) / (colors.length - 1));
        return `<g transform="rotate(${deg})"><ellipse cx="0" cy="${-ry}" rx="${rx}" ry="${ry}" ${paint("c-fg", "ink")}/><ellipse cx="0" cy="${-ry + 9}" rx="${rx - 1}" ry="${ry - 9}" ${paint(c)}/><ellipse cx="0" cy="${f(-ry * 1.55)}" rx="${f(rx * 0.75)}" ry="3" ${paint("c-dark")}/></g>`;
      })
      .join("");
  const inner = (rx: number, ry: number, colors: Paint[], from: number, to: number) =>
    colors
      .map((c, i) => {
        const deg = f(from + ((to - from) * i) / (colors.length - 1));
        return `<ellipse cx="0" cy="${-ry}" rx="${rx}" ry="${ry}" transform="rotate(${deg})" ${paint(c, "ink")}/>`;
      })
      .join("");
  return `<g id="tg-turkey">
      <g transform="translate(-14 -60)">
        ${tail(15, 50, ["c-bronze", "c-dark", "c-bronze", "c-dark", "c-bronze", "c-dark", "c-bronze"], -78, 50)}
        ${inner(12, 34, ["c-dark", "c-bronze", "c-dark", "c-bronze", "c-dark"], -66, 38)}
      </g>
      <ellipse cx="6" cy="-52" rx="40" ry="33" ${paint("c-dark", "ink")}/>
      <ellipse cx="-2" cy="-50" rx="24" ry="15" transform="rotate(-14 -2 -50)" ${paint("c-bronze", "ink")}/>
      <path d="M 22 -68 C 30 -80, 34 -92, 38 -104 L 52 -100 C 47 -88, 45 -76, 42 -62 Z" ${paint("c-red", "ink")}/>
      <circle cx="46" cy="-106" r="14" ${paint("c-red", "ink")}/>
      <circle cx="50" cy="-110" r="7" ${paint("c-blue")}/>
      <path d="M 58 -110 L 72 -104 L 58 -99 Z" ${paint("c-gold", "ink-soft")}/>
      <path d="M 57 -100 C 64 -96, 64 -85, 57 -80 C 52 -85, 52 -95, 57 -100 Z" ${paint("c-red", "ink-soft")}/>
      <circle cx="50" cy="-110" r="3.5" ${paint("c-deep")}/>
      <circle cx="51" cy="-111" r="1.2" ${paint("c-fg")}/>
    </g>
    <path id="tg-leg" d="M 0 0 L 0 24 M -4 25 L 11 25" ${paint("leg-line")}/>`;
}


/**
 * A turkey with its legs, feet on the ground at x. `step` is how long one
 * stride takes; the turkeys walk at slightly different paces.
 */
function turkey(x: number, scale: number, step: number): string {
  const leg = (hipX: number, cls: string) =>
    `<g transform="translate(${hipX} -26)"><g class="${cls}"><use href="#tg-leg"/></g></g>`;
  return `<g transform="translate(${x} ${GROUND - 4}) scale(${scale})" style="--step:${step}s">
    ${leg(-6, "leg leg-a")}${leg(12, "leg leg-b")}
    <g class="bob"><use href="#tg-turkey"/></g>
  </g>`;
}

/**
 * Three turkeys, and the same three again one width to the left. The group
 * slides one width to the right and starts over, so the parade never jumps.
 */
function parade(): string {
  const flock: [number, number, number][] = [
    [150, 0.8, 0.46],
    [520, 0.9, 0.5],
    [880, 0.75, 0.54],
  ];
  const all = flock.flatMap(([x, s, step]) => [turkey(x, s, step), turkey(x - 1200, s, step)]);
  return `<g class="parade">${all.join("")}</g>`;
}

/**
 * Leaves drifting down, each drawn at its still-frame spot. A leaf first drops
 * from that spot to below the bottom edge, then falls from above the top edge
 * to below the bottom over and over, at the same speed.
 */
function fallingLeaves(): string {
  const top = -80;
  const bottom = 710;
  const leaves: [number, number, number, number, Paint, number][] = [
    [470, 92, 44, -30, "c-gold", 13],
    [330, 445, 34, 70, "c-gold", 16],
    [640, 405, 38, 40, "c-brass", 11],
    [770, 58, 50, 20, "c-pumpkin", 15],
    [720, 500, 40, 60, "c-brass", 12.5],
    [1130, 120, 46, -50, "c-gold", 12],
    [1160, 450, 36, -15, "c-pumpkin", 14],
  ];
  return leaves
    .map(([x, y, len, deg, color, secs], i) => {
      const firstDrop = f((secs * (bottom - y)) / (bottom - top));
      return `<g transform="translate(${x} ${y})"><g class="fall" style="--y:${y}px;--dur:${secs}s;--in:${firstDrop}s">
      <g class="sway" style="--delay:${f(i * 0.7)}s"><g transform="rotate(${deg})">${leaf(len, color)}</g></g></g></g>`;
    })
    .join("");
}

/** The still layer: the room, the ground, the pie and the glow. Nothing here moves. */
const back = `<defs>
  <linearGradient id="tg-sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" style="stop-color:var(--stage)"/>
    <stop offset="1" style="stop-color:var(--stage-deep)"/>
  </linearGradient>
  <radialGradient id="tg-overhead" cx="360" cy="-63" r="840" gradientUnits="userSpaceOnUse" gradientTransform="translate(0 -37.2) scale(1 0.41)">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.22"/>
    <stop offset="0.62" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <pattern id="tg-dots" width="22" height="22" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" style="fill:var(--stage-fg)" fill-opacity="0.06"/>
  </pattern>
  <radialGradient id="tg-halo" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.32"/>
    <stop offset="1" style="stop-color:var(--gold)" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="tg-baked" cx="0.44" cy="0.54" r="0.6">
    <stop offset="0" style="stop-color:var(--gold)" stop-opacity="0.35"/>
    <stop offset="0.7" style="stop-color:var(--gold)" stop-opacity="0"/>
    <stop offset="1" style="stop-color:var(--amber)" stop-opacity="0.6"/>
  </radialGradient>
  <filter id="tg-glow" x="-20%" y="-40%" width="140%" height="180%">
    <feGaussianBlur stdDeviation="12"/>
  </filter>
</defs>
<rect width="1200" height="630" fill="url(#tg-sky)"/>
<rect width="1200" height="630" fill="url(#tg-overhead)"/>
<rect width="1200" height="630" fill="url(#tg-dots)"/>
<path d="M 0 588 Q 300 566 600 586 T 1200 580 L 1200 630 L 0 630 Z" class="c-panel"/>
${pie(990, 262, 150)}
${triviaGlow()}
<rect y="620" width="1200" height="10" class="c-brass"/>`;

/** The moving layer, over the still one: turkeys, leaves, and the words with their garland. */
const front = `<defs>${LEAF}${turkeyBody()}</defs>
${parade()}
${fallingLeaves()}
${words()}`;

const css = `
${Object.entries(PAINT)
  .map(([name, rules]) => `${ROOT} .${name} { ${rules}; }`)
  .join("\n")}
${ROOT} .crease { fill: none; stroke: var(--stage-deep); stroke-opacity: 0.3; stroke-width: 2; }
${ROOT} .vine { fill: none; stroke: var(--brass); stroke-width: 6; stroke-linecap: round; }
${ROOT} .word { font-family: var(--font-display), "Rockwell Extra Bold", Georgia, serif; font-size: 96px; }

${ROOT} .parade { animation: tg-parade 36s linear var(--start) infinite; }
@keyframes tg-parade { to { transform: translateX(1200px); } }
${ROOT} .leg { animation: tg-step calc(2 * var(--step)) ease-in-out var(--start) infinite; }
${ROOT} .leg-b { animation-delay: calc(var(--start) + var(--step)); }
@keyframes tg-step {
  25% { transform: rotate(22deg); }
  75% { transform: rotate(-22deg); }
}
${ROOT} .bob { animation: tg-bob calc(var(--step) / 2) ease-in-out var(--start) infinite alternate; }
@keyframes tg-bob { to { transform: translateY(-4px); } }

${ROOT} .fall {
  animation: tg-drop var(--in) linear var(--start) 1, tg-fall var(--dur) linear calc(var(--start) + var(--in)) infinite;
}
@keyframes tg-drop { to { transform: translateY(calc(710px - var(--y))); } }
@keyframes tg-fall {
  from { transform: translateY(calc(-80px - var(--y))); }
  to { transform: translateY(calc(710px - var(--y))); }
}
${ROOT} .sway { animation: tg-sway 3.2s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes tg-sway {
  25% { transform: translateX(22px) rotate(30deg); }
  75% { transform: translateX(-22px) rotate(-30deg); }
}
${ROOT} .dangle { animation: tg-dangle 2.6s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes tg-dangle {
  25% { transform: rotate(9deg); }
  75% { transform: rotate(-9deg); }
}
${ROOT} .hop { animation: tg-hop 4s ease-in-out calc(var(--start) + var(--delay)) infinite; }
@keyframes tg-hop {
  0%, 30%, 100% { transform: none; }
  8% { transform: translateY(-14px) rotate(-6deg); }
  16% { transform: none; }
  23% { transform: translateY(-6px) rotate(4deg); }
}
`;

export const thanksgivingScene: AnimatedScene = { back, front, css };
