-- Round mode (RM0): a game runs round by round, the only mode for new sessions.
--
-- Purely additive, because preview builds run `prisma migrate deploy` against the
-- production database: new columns with defaults, one new table, one new index.
-- No table rebuild, nothing dropped, renamed or rewritten.
--
-- Session.mode defaults to 'QUESTION', so every session that existed before this
-- migration keeps running the one-question-at-a-time flow it started with; new
-- sessions are created with mode 'ROUND' by POST /api/sessions.
ALTER TABLE "Session" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'QUESTION';
ALTER TABLE "Session" ADD COLUMN "askedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "revealedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "scoreboardShown" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "tvShowsAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Session" ADD COLUMN "countdownStartedAt" DATETIME;
ALTER TABLE "Session" ADD COLUMN "countdownSeconds" INTEGER;

-- A team the host added by name, playing on paper. Existing teams are phone teams.
ALTER TABLE "Team" ADD COLUMN "isPaper" BOOLEAN NOT NULL DEFAULT false;

-- A round total the host typed in. A row exists only while a typed total stands.
CREATE TABLE "RoundScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoundScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoundScore_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RoundScore_sessionId_teamId_roundIndex_key" ON "RoundScore"("sessionId", "teamId", "roundIndex");
