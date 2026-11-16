-- L1: the language a pack is written in, and the language a game is played
-- in. Additive only: every existing row becomes English.
ALTER TABLE "QuizPack" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "Session" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'en';
