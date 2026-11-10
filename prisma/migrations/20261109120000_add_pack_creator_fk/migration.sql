-- A real foreign key from QuizPack.creatorId to Creator (M5).
--
-- The schema has always declared the relation, but 20260907000000_add_creator
-- added "creatorId" as a plain text column, so the database never enforced it:
-- a pack could name a creator that does not exist, and deleting a creator left
-- its packs behind, invisible to everyone and never cleaned up.
--
-- NOT purely additive, unlike every migration before it, and previews share the
-- production database, so this runs on live data when the branch is built.
-- SQLite cannot add a foreign key to an existing column. What it can do is add a
-- new column that has one (the default is NULL, which is allowed), so the column
-- is swapped in place: add, copy, drop the old one, rename. No table is dropped
-- or rebuilt, so no ON DELETE CASCADE can fire on rounds or sessions, and it
-- needs no PRAGMA foreign_keys = OFF, which `prisma migrate diff`'s table
-- rebuild relies on and a remote libSQL connection may not honour.
--
-- ON DELETE CASCADE: a pack with no owner is readable by every signed-in host
-- (src/lib/pack-access.ts), so SET NULL would publish a deleted account's packs.
-- /privacy promises they are deleted with the account.

-- Packs whose creator row is already gone keep their id, and get a placeholder
-- creator so the copy below cannot fail and they stay as invisible as they are
-- today. Nothing is deleted and nothing becomes ownerless. To list them later:
--   SELECT * FROM "Creator" WHERE "deviceKey" LIKE 'orphaned-pack-owner:%';
INSERT INTO "Creator" ("id", "deviceKey")
SELECT DISTINCT "creatorId", 'orphaned-pack-owner:' || "creatorId"
FROM "QuizPack"
WHERE "creatorId" IS NOT NULL AND "creatorId" NOT IN (SELECT "id" FROM "Creator");

ALTER TABLE "QuizPack" ADD COLUMN "creatorIdFk" TEXT REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "QuizPack" SET "creatorIdFk" = "creatorId";

-- A column cannot be dropped while an index uses it.
DROP INDEX "QuizPack_creatorId_idx";

ALTER TABLE "QuizPack" DROP COLUMN "creatorId";

ALTER TABLE "QuizPack" RENAME COLUMN "creatorIdFk" TO "creatorId";

CREATE INDEX "QuizPack_creatorId_idx" ON "QuizPack"("creatorId");
