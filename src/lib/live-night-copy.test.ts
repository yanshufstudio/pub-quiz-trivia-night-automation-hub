import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No em dash in anything the live night says: the host desk, the team phone,
 * the TV, and the error text the session routes send back to them. Comments
 * may use one; copy may not. The e2e twin (live-night-no-emdash.spec.ts) reads
 * the rendered screens; this one also covers messages that are hard to reach
 * from a browser, such as a full quiz.
 */
const LIVE_NIGHT = [
  "src/app/host",
  "src/app/play",
  "src/app/tv",
  "src/app/api/sessions",
  "src/lib/round-state.ts",
  "src/components/ConfirmPanel.tsx",
  "src/components/JoinQr.tsx",
  "src/components/Scoreboard.tsx",
  "src/components/RoundCountdown.tsx",
  "src/components/Countdown.tsx",
];

function sourceFiles(entry: string, found: string[] = []): string[] {
  if (statSync(entry).isDirectory()) {
    for (const child of readdirSync(entry)) sourceFiles(path.join(entry, child), found);
  } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
    found.push(entry);
  }
  return found;
}

/** The file with its comments blanked out, line numbers kept. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("live-night copy", () => {
  it("has no em dash outside comments", () => {
    const offenders = LIVE_NIGHT.flatMap((entry) => sourceFiles(entry)).flatMap((file) =>
      withoutComments(readFileSync(file, "utf8"))
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => line.includes("—"))
        .map(({ line, n }) => `${file}:${n}: ${line.trim()}`)
    );
    expect(offenders).toEqual([]);
  });
});
