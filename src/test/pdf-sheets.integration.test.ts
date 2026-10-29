import { inflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET as getPdf } from "@/app/api/packs/[id]/pdf/route";
import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";
const host = await signInTestHost();

/**
 * The three PDFs carry the same sheet names as Print preview: in the kicker
 * above the pack's title and in the file name. The team sheet's line under
 * the title is the Team name line, once; the host's two keep the lectern line.
 *
 * The kicker is drawn upper case (`textTransform` in documents.tsx), so that
 * is how it is read back here.
 */
const SHEETS = [
  { type: "script", kicker: "PRESENTER SCRIPT", file: "presenter-script", team: false },
  { type: "answers", kicker: "HOST ANSWER KEY", file: "host-answer-key", team: false },
  { type: "questions", kicker: "TEAM ANSWER SHEET", file: "team-answer-sheet", team: true },
] as const;

/**
 * The text runs of a react-pdf document, in drawing order. Each page's content
 * stream is deflated, and text in the standard Times faces is written as hex
 * strings in WinAnsi encoding, one `[...] TJ` array per run.
 */
function textRuns(pdf: Uint8Array): string[] {
  const source = Buffer.from(pdf).toString("latin1");
  const runs: string[] = [];
  for (const [, body] of source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(body, "latin1")).toString("latin1");
    } catch {
      continue; // not a deflated content stream (an image, say)
    }
    for (const [, array] of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      runs.push(
        [...array.matchAll(/<([0-9a-f]*)>/gi)].map(([, hex]) => Buffer.from(hex, "hex").toString("latin1")).join("")
      );
    }
  }
  return runs;
}

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe("the PDF sheets' names and the line under the title", () => {
  const suffix = Math.random().toString(36).slice(2);
  let packId: string;

  beforeAll(async () => {
    const pack = await createPackFromGenerated(
      {
        title: `PDF Sheet Names ${suffix}`,
        rounds: [
          {
            title: "Round Title",
            category: "General Knowledge",
            questions: [{ text: "Which question?", answer: "This one", points: 1, type: "TEXT" as const }],
          },
        ],
      },
      "pdf sheet names test",
      null
    );
    packId = pack.id;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it.each(SHEETS)("type=$type: kicker $kicker, file $file", async (sheet) => {
    const res = await getPdf(
      new NextRequest(`${BASE}/api/packs/${packId}/pdf?type=${sheet.type}`, { headers: host.cookieHeader }),
      { params: Promise.resolve({ id: packId }) }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="pdf-sheet-names-${suffix}-${sheet.file}.pdf"`
    );

    const runs = textRuns(new Uint8Array(await res.arrayBuffer()));
    expect(runs[0]).toBe(sheet.kicker);
    const text = runs.join("");
    expect(text).toContain(`PDF Sheet Names ${suffix}`);
    expect(occurrences(text, "Team name:")).toBe(sheet.team ? 1 : 0);
    expect(occurrences(text, "keep this copy at the lectern")).toBe(sheet.team ? 0 : 1);
  });
});
