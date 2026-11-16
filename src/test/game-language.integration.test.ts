import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as createSession } from "@/app/api/sessions/route";
import { GET as getDisplay } from "@/app/api/sessions/[code]/display/route";
import { db } from "@/lib/db";
import { signInTestHost } from "./auth-fixture";
import { roundGame } from "./round-fixture";

/**
 * L1: a pack has a language, English unless set, and a game started on it
 * takes that language and keeps it: the host desk, the phones and the TV are
 * all told the game's language with every poll.
 */

const host = await signInTestHost();
const game = roundGame(host);

afterAll(async () => {
  await db.$disconnect();
});

describe("the game's language", () => {
  it("is English for a pack that never set one", async () => {
    const { code, hostToken, packId } = await game.create();
    expect((await db.quizPack.findUniqueOrThrow({ where: { id: packId } })).language).toBe("en");
    const token = await game.join(code, "Quizzly Bears");
    expect((await (await game.teamView(code, token)).json()).language).toBe("en");
    expect((await (await game.hostView(code, hostToken)).json()).language).toBe("en");
  });

  it("comes from the pack, and stays with the game if the pack changes", async () => {
    const { packId } = await game.create();
    await db.quizPack.update({ where: { id: packId }, data: { language: "xx" } });
    const res = await createSession(game.request("/api/sessions", "POST", { packId }));
    const { session, hostToken } = await res.json();
    await db.quizPack.update({ where: { id: packId }, data: { language: "en" } });

    const token = await game.join(session.code, "Quizzly Bears");
    expect((await (await game.teamView(session.code, token)).json()).language).toBe("xx");
    expect((await (await game.hostView(session.code, hostToken)).json()).language).toBe("xx");
    const tv = await getDisplay(new NextRequest(`http://localhost:3000/api/sessions/${session.code}/display`), {
      params: Promise.resolve({ code: session.code }),
    });
    expect((await tv.json()).language).toBe("xx");
  });
});
