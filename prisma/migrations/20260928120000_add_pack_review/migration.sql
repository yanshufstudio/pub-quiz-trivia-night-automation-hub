-- Whether a generated pack went through the accuracy review (ACC2).
--
-- Purely additive: four new nullable columns on QuizPack. No index, no
-- foreign key, nothing dropped, rebuilt or rewritten, and no existing row
-- changes — plain ADD COLUMNs, which SQLite does in place.
--
-- NULL is what every existing pack gets, and it means "never went through the
-- review": packs generated before it existed, imported packs and the demo. The
-- host is shown a banner only for "not_checked" — a pack whose review was
-- attempted and did not finish, or was switched off — never for NULL.
ALTER TABLE "QuizPack" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "QuizPack" ADD COLUMN "reviewFixed" INTEGER;
ALTER TABLE "QuizPack" ADD COLUMN "reviewDropped" INTEGER;
ALTER TABLE "QuizPack" ADD COLUMN "reviewNotes" TEXT;
