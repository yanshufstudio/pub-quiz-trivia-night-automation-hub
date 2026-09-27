import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { PATCH as patchQuestion } from "@/app/api/questions/[id]/route";
import { POST as importPack } from "@/app/api/packs/import/route";
import { db } from "@/lib/db";
import { PACK_FILE_FORMAT, PACK_FILE_VERSION, PACK_LIMITS } from "@/lib/pack-file";
import { signInTestHost, type TestHost } from "./auth-fixture";

const BASE = "http://localhost:3000";
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

/**
 * What the editor will save and what a pack file may contain are the same thing
 * (M5).
 *
 * They were not. Import accepted 20 alternates of up to 200 characters; the editor
 * accepted 10 of up to 100. So a pack imported with a dozen alternates — or one
 * alternate longer than a tweet — could not then be saved from the editor at all,
 * and the host got "Couldn't save" with no reason given. Options disagreed the other
 * way: the editor had no length bound, so it could save an option its own export
 * could not re-import.
 */

let owner: TestHost;
let ip = 1100;

function ownedRequest(url: string, method: string, body?: unknown) {
  ip += 1;
  return new NextRequest(`${BASE}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": `10.2.0.${ip % 250}`,
      ...owner.cookieHeader,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const alternates = (count: number, length = PACK_LIMITS.acceptableAnswer) =>
  Array.from({ length: count }, (_, i) => `${String(i).padStart(3, "0")}`.padEnd(length, "x"));

async function importWith(acceptableAnswers: string[], options?: string[]) {
  return importPack(
    ownedRequest("/api/packs/import", "POST", {
      format: PACK_FILE_FORMAT,
      version: PACK_FILE_VERSION,
      title: `Limits Pack ${Math.random().toString(36).slice(2)}`,
      rounds: [
        {
          title: "Round One",
          category: "General Knowledge",
          questions: [
            {
              text: "What is the capital of Australia?",
              answer: "Canberra",
              points: 1,
              type: options ? "MULTIPLE_CHOICE" : "TEXT",
              ...(options ? { options } : {}),
              acceptableAnswers,
            },
          ],
        },
      ],
    })
  );
}

afterAll(async () => {
  await db.$disconnect();
});

describe("alternate answers: the editor and the pack file agree", () => {
  it("lets the editor save the most a pack file may carry", async () => {
    // The exact case that failed: import at the file's ceiling, then edit.
    owner = await signInTestHost();
    const full = alternates(PACK_LIMITS.acceptableAnswersPerQuestion);

    const imported = await importWith(full);
    expect(imported.status).toBe(201);
    const question = await db.question.findFirstOrThrow({
      where: { round: { pack: { creatorId: owner.id } } },
    });

    const saved = await patchQuestion(
      ownedRequest(`/api/questions/${question.id}`, "PATCH", { acceptableAnswers: full }),
      idParams(question.id)
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).question.acceptableAnswers).toHaveLength(
      PACK_LIMITS.acceptableAnswersPerQuestion
    );
  });

  it("refuses one more than that, on both routes", async () => {
    // Agreeing is not the same as having no limit.
    owner = await signInTestHost();
    const tooMany = alternates(PACK_LIMITS.acceptableAnswersPerQuestion + 1);

    expect((await importWith(tooMany)).status).toBe(400);

    const imported = await importWith([]);
    expect(imported.status).toBe(201);
    const question = await db.question.findFirstOrThrow({
      where: { round: { pack: { creatorId: owner.id } } },
    });
    expect(
      (
        await patchQuestion(
          ownedRequest(`/api/questions/${question.id}`, "PATCH", { acceptableAnswers: tooMany }),
          idParams(question.id)
        )
      ).status
    ).toBe(400);
  });

  it("agrees on how long one alternate may be", async () => {
    owner = await signInTestHost();
    const imported = await importWith([]);
    expect(imported.status).toBe(201);
    const question = await db.question.findFirstOrThrow({
      where: { round: { pack: { creatorId: owner.id } } },
    });

    const atLimit = ["x".repeat(PACK_LIMITS.acceptableAnswer)];
    const overLimit = ["x".repeat(PACK_LIMITS.acceptableAnswer + 1)];

    expect(
      (
        await patchQuestion(
          ownedRequest(`/api/questions/${question.id}`, "PATCH", { acceptableAnswers: atLimit }),
          idParams(question.id)
        )
      ).status
    ).toBe(200);
    expect(
      (
        await patchQuestion(
          ownedRequest(`/api/questions/${question.id}`, "PATCH", { acceptableAnswers: overLimit }),
          idParams(question.id)
        )
      ).status
    ).toBe(400);
    expect((await importWith(overLimit)).status).toBe(400);
  });

  it("agrees on how long an option may be, which disagreed the other way", async () => {
    // The editor had no length bound at all, so it could save an option that its
    // own export could not re-import — a pack that round-trips through Export →
    // Import and comes back rejected.
    owner = await signInTestHost();
    const imported = await importWith([], ["Canberra", "Sydney"]);
    expect(imported.status).toBe(201);
    const question = await db.question.findFirstOrThrow({
      where: { round: { pack: { creatorId: owner.id } } },
    });

    /**
     * The answer ("Canberra") stays in the option list, so the only thing wrong
     * with the request is the length of the other option.
     *
     * An earlier version of this test left the answer out, and the route rejected
     * it for *that* reason — so it returned 400 and passed even with the length
     * bound removed entirely. Mutation testing is how that was found.
     */
    const okLength = ["Canberra", "x".repeat(PACK_LIMITS.option)];
    const overLength = ["Canberra", "x".repeat(PACK_LIMITS.option + 1)];

    const accepted = await patchQuestion(
      ownedRequest(`/api/questions/${question.id}`, "PATCH", {
        type: "MULTIPLE_CHOICE",
        options: okLength,
      }),
      idParams(question.id)
    );
    expect(accepted.status, "an option at the limit is fine, so the refusal below is about length").toBe(200);

    expect(
      (
        await patchQuestion(
          ownedRequest(`/api/questions/${question.id}`, "PATCH", {
            type: "MULTIPLE_CHOICE",
            options: overLength,
          }),
          idParams(question.id)
        )
      ).status
    ).toBe(400);
  });
});
