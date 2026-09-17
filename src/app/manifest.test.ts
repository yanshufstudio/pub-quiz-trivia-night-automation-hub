import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

function cssToken(name: string): string {
  const css = readFileSync(path.resolve(__dirname, "globals.css"), "utf8");
  const match = css.match(new RegExp(`--${name}: *(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --${name} not found in globals.css`);
  return match[1];
}

describe("web app manifest", () => {
  const m = manifest();

  it("names the app and opens at the root in standalone mode", () => {
    expect(m.name).toBe("TriviaFoundry");
    expect(m.short_name).toBe("TriviaFoundry");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
  });

  it("uses the stage green from the CSS tokens for both splash and chrome", () => {
    expect(m.background_color).toBe(cssToken("stage"));
    expect(m.theme_color).toBe(cssToken("stage"));
  });

  it("offers 256 and 512 PNG icons plus a maskable one, all from public/", () => {
    const icons = m.icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("256x256");
    expect(sizes).toContain("512x512");
    for (const icon of icons) {
      expect(existsSync(path.resolve(__dirname, "../../public", icon.src.replace(/^\//, "")))).toBe(true);
    }
    expect(icons.every((i) => i.type === "image/png")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });
});
