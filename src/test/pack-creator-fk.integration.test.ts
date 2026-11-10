import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";

import { createPackFromGenerated } from "@/lib/create-pack";
import { db } from "@/lib/db";
import { DEMO_PACK } from "@/lib/demo-pack";

/**
 * QuizPack.creatorId is a real foreign key (M5).
 *
 * It was a plain text column: the schema declared the relation and the
 * database did not enforce it, so deleting a creator left its packs behind.
 */

afterAll(async () => {
  await db.$disconnect();
});

describe("the foreign key, in a database built from the migrations", () => {
  it("exists, points at Creator, and cascades", async () => {
    const keys = await db.$queryRaw<{ table: string; from: string; to: string; on_delete: string }[]>`
      PRAGMA foreign_key_list("QuizPack")`;
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({ table: "Creator", from: "creatorId", to: "id", on_delete: "CASCADE" });
  });

  it("refuses a pack that names a creator who does not exist", async () => {
    await expect(
      db.quizPack.create({ data: { title: "Nobody's", prompt: "p", creatorId: "no-such-creator" } })
    ).rejects.toThrow();
  });

  it("still allows a pack with no owner, which is what the demo pack is", async () => {
    const pack = await db.quizPack.create({ data: { title: "Ownerless", prompt: "p" } });
    expect(pack.creatorId).toBeNull();
  });

  it("deletes an account's packs, rounds and questions with its creator, and nobody else's", async () => {
    const [leaving, staying] = await Promise.all(
      ["leaving", "staying"].map((who) => db.creator.create({ data: { deviceKey: `${who}-${Math.random()}` } }))
    );
    const gone = await createPackFromGenerated({ ...DEMO_PACK, title: "Leaving's pack" }, "p", leaving.id);
    const kept = await createPackFromGenerated({ ...DEMO_PACK, title: "Staying's pack" }, "p", staying.id);

    await db.creator.delete({ where: { id: leaving.id } });

    expect(await db.quizPack.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await db.round.count({ where: { packId: gone.id } })).toBe(0);
    expect(await db.question.count({ where: { round: { packId: gone.id } } })).toBe(0);
    expect(await db.round.count({ where: { packId: kept.id } })).toBe(kept.rounds.length);
  });
});

describe("the migration, run over a database that already has packs in it", () => {
  // Previews run `prisma migrate deploy` against the production database, and
  // this migration is not purely additive: it swaps the column in place. So it
  // is replayed here over rows like production's, including the awkward one.
  const migrations = path.resolve(__dirname, "../../prisma/migrations");
  const names = readdirSync(migrations).filter((name) => /^\d{14}_/.test(name)).sort();
  const sqlOf = (name: string) => readFileSync(path.join(migrations, name, "migration.sql"), "utf8");
  const mine = names.find((name) => name.endsWith("_add_pack_creator_fk"))!;

  it("is the newest migration, so everything before it is what production has", () => {
    expect(names.at(-1)).toBe(mine);
  });

  it("keeps every pack, round and owner, and hides rather than deletes or publishes an orphan", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pack-fk-"));
    const old = createClient({ url: `file:${path.join(dir, "old.db")}` });
    try {
      for (const name of names.filter((name) => name !== mine)) await old.executeMultiple(sqlOf(name));
      // The state being fixed: no foreign key at all.
      expect((await old.execute(`PRAGMA foreign_key_list("QuizPack")`)).rows).toHaveLength(0);

      await old.executeMultiple(`
        INSERT INTO "Creator" ("id", "deviceKey") VALUES ('c1', 'device-1');
        INSERT INTO "QuizPack" ("id", "title", "prompt", "creatorId", "reviewStatus") VALUES
          ('owned', 'Owned', 'p', 'c1', 'checked'),
          ('demo', 'Demo', 'p', NULL, NULL),
          ('orphan', 'Orphan', 'p', 'deleted-creator', NULL);
        INSERT INTO "Round" ("id", "packId", "index", "title", "category") VALUES
          ('r1', 'owned', 0, 'R', 'C'), ('r2', 'demo', 0, 'R', 'C'), ('r3', 'orphan', 0, 'R', 'C');
        INSERT INTO "Session" ("id", "code", "packId", "hostToken") VALUES ('s1', 'ABCDE', 'owned', 'h');
      `);
      const columnsBefore = (await old.execute(`PRAGMA table_info("QuizPack")`)).rows.map((row) => row.name);

      await old.executeMultiple(sqlOf(mine));

      const packs = await old.execute(`SELECT "id", "title", "creatorId", "reviewStatus" FROM "QuizPack" ORDER BY "id"`);
      expect(packs.rows.map((row) => ({ ...row }))).toEqual([
        { id: "demo", title: "Demo", creatorId: null, reviewStatus: null },
        // Not NULL (which would make it readable by every host) and not gone.
        { id: "orphan", title: "Orphan", creatorId: "deleted-creator", reviewStatus: null },
        { id: "owned", title: "Owned", creatorId: "c1", reviewStatus: "checked" },
      ]);
      expect((await old.execute(`SELECT COUNT(*) AS n FROM "Round"`)).rows[0].n).toBe(3);
      expect((await old.execute(`SELECT COUNT(*) AS n FROM "Session"`)).rows[0].n).toBe(1);

      const placeholders = await old.execute(
        `SELECT "id", "userId", "plan" FROM "Creator" WHERE "deviceKey" LIKE 'orphaned-pack-owner:%'`
      );
      expect(placeholders.rows.map((row) => ({ ...row }))).toEqual([{ id: "deleted-creator", userId: null, plan: "FREE" }]);

      // Same columns as before (only their order changed), the index is back,
      // the key is there, and no row breaks it.
      const columnsAfter = (await old.execute(`PRAGMA table_info("QuizPack")`)).rows.map((row) => row.name);
      expect([...columnsAfter].sort()).toEqual([...columnsBefore].sort());
      const indexes = (await old.execute(`PRAGMA index_list("QuizPack")`)).rows.map((row) => row.name);
      expect(indexes).toContain("QuizPack_creatorId_idx");
      expect((await old.execute(`PRAGMA foreign_key_list("QuizPack")`)).rows).toHaveLength(1);
      expect((await old.execute(`PRAGMA foreign_key_check`)).rows).toHaveLength(0);
    } finally {
      old.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
