import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the stage palette's *lightness*, which is the one property of this
 * theme that is easy to break by eye and impossible to notice once broken.
 *
 * The first cut of "Lit pub sign" put the three greens at roughly L* 5 / 8 / 16.
 * Both halves of that were wrong. Hue stops being perceptible below about
 * L* 15, so a 42%-saturated bottle green at L* 8 renders as plain black — the
 * colour was specified and never seen. And the whole ladder spanned 11 points,
 * so panels barely separated from the ground and the stage read as one flat
 * slab instead of a room with things standing in it.
 *
 * Contrast is deliberately *not* the thing under test here: every stage
 * foreground cleared AA at the old values too, which is exactly why a contrast
 * check would have waved the problem through. The floor below is perceptual.
 */

function tokens(): Record<string, [number, number, number]> {
  const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");
  const out: Record<string, [number, number, number]> = {};
  for (const [, name, hex] of css.matchAll(/--([a-z-]+): *(#[0-9a-fA-F]{6})/g)) {
    out[name] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  return out;
}

const channel = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/** CIE L*, the perceptual lightness axis: 0 is black, 100 is white. */
function lightness(rgb: [number, number, number]): number {
  const y = luminance(rgb);
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("stage palette", () => {
  const T = tokens();

  it("keeps the ground above the floor where hue becomes visible", () => {
    // Below ~L* 15 the eye cannot resolve hue, so the green reads as black and
    // the whole "bottle green stage" idea is paid for and not delivered.
    expect(lightness(T.stage)).toBeGreaterThanOrEqual(15);
  });

  it("separates deep, ground and panel enough for panels to lift", () => {
    const [deep, stage, panel] = [T["stage-deep"], T.stage, T["stage-panel"]].map(lightness);
    expect(deep).toBeLessThan(stage);
    expect(stage).toBeLessThan(panel);
    // A panel that sits only a few points above its ground disappears into it.
    expect(panel - stage).toBeGreaterThanOrEqual(7);
    expect(stage - deep).toBeGreaterThanOrEqual(4);
  });

  it("stays dark enough to still read as a lit sign after dark", () => {
    // The lift is a correction, not a licence to turn the stage into daylight.
    expect(lightness(T["stage-panel"])).toBeLessThanOrEqual(38);
  });

  it("carries every stage foreground at AA on every stage surface", () => {
    for (const surface of ["stage", "stage-deep", "stage-panel"]) {
      for (const fg of ["stage-fg", "stage-muted", "gold", "mint"]) {
        expect(contrast(T[surface], T[fg]), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
