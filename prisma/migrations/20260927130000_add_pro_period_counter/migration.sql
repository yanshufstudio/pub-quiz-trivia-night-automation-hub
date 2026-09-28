-- Pro packs generated in the current Paddle billing period (M8).
--
-- Purely additive: two new columns on Creator, no index, nothing dropped or
-- rewritten. Hand-written like every migration here, and this one needs no
-- table rebuild at all — neither column carries a foreign key.
--
-- Why not reuse packsGeneratedInPeriod: that counter is a rolling 30 days
-- (withRolledPeriod in src/lib/creator.ts), which is close enough to a monthly
-- subscription and plainly wrong for an annual one. /refunds states its terms
-- as "Pro packs generated in the current billing period", so the number a host
-- is judged by has to be the number the page describes.
--
-- proPeriodStartedAt is NULL until the first subscription event carrying
-- Paddle's current_billing_period.starts_at arrives, which is deliberate: the
-- count rolls on Paddle's word about when the period began, never on a clock of
-- ours.
ALTER TABLE "Creator" ADD COLUMN "proPacksGeneratedInPeriod" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Creator" ADD COLUMN "proPeriodStartedAt" DATETIME;
