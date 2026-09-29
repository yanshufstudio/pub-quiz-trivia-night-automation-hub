-- Pro fair use (PRC5): a rolling 30-day window of Pro packs per Creator.
--
-- Purely additive: two new columns on Creator, no index, nothing dropped or
-- rewritten, no table rebuild (neither column carries a foreign key).
--
-- Why not reuse proPacksGeneratedInPeriod (M8): that count rolls on Paddle's
-- billing period, which is a year on the annual price, and a comped account
-- (PRO_COMP_EMAILS) has no billing period at all. /refunds still reads M8, so
-- it stays as it is.
--
-- proWindowStartedAt is NULL until the account's first Pro generation, which
-- starts the first window.
ALTER TABLE "Creator" ADD COLUMN "proWindowCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Creator" ADD COLUMN "proWindowStartedAt" DATETIME;
