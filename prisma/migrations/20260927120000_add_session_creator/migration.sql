-- The account that started a game session (H4).
--
-- Purely additive: one new nullable column and one index. Nothing existing is
-- dropped, rebuilt or rewritten, so this is safe to run against production
-- data — which matters more than usual here, because previews share the
-- production database.
--
-- Hand-written, as every migration in this repo is, and for the same reason
-- the accounts migration spells out: `prisma migrate diff` generates a full
-- table rebuild for this change (DROP TABLE "Session", recreate, copy rows
-- back), because SQLite cannot add a foreign key to an existing table in
-- place. That would drop and recreate the table holding every live game in
-- production to gain one nullable column. SQLite does allow ADD COLUMN with a
-- REFERENCES clause as long as the new column's default is NULL, which this
-- one's is, and an index can simply be created afterwards.
--
-- Why the column exists: the host key is still the authority over a session
-- (isValidHostToken in src/lib/host-auth.ts), and it lives in one browser's
-- local storage. A host who closed that browser, or picked up a different
-- device mid-night, had no way back into their own desk. This is the weaker
-- second claim that gives them one.
--
-- ON DELETE SET NULL, not CASCADE: deleting an account must not delete the
-- games it ran. A pub's scoreboard should outlive the account that started it.
ALTER TABLE "Session" ADD COLUMN "creatorId" TEXT REFERENCES "Creator" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- "Your live games" reads sessions by creator, so this is the lookup it makes.
CREATE INDEX "Session_creatorId_idx" ON "Session"("creatorId");
