-- One free allowance per mailbox, shared by every account behind it (H1b).
--
-- Purely additive: a new table. Nothing existing is altered, dropped, rebuilt
-- or rewritten, and no existing row changes — which matters more than usual
-- here, because previews share the production database. A new table is the one
-- shape of change SQLite has no trouble with at all.
--
-- Why a table and not a column on Creator: the shared allowance needs its own
-- 30-day period. Aggregating a count across the accounts that share a mailbox
-- would leave the period anchored to whichever account generated first, and a
-- second account joining later would inherit a clock it never started. This row
-- has its own, rolled by exactly the rule withRolledPeriod uses for a Creator.
--
-- The primary key is a SHA-256 digest of the normalised mailbox, not the
-- address. The row must outlive the deletion of every account behind it — a cap
-- that a "delete my account" resets is not a cap — and a row designed to
-- outlive the account must not be a second stored copy of somebody's email.
-- Equality is all this table ever needs.
CREATE TABLE "MailboxAllowance" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "packsGenerated" INTEGER NOT NULL DEFAULT 0,
    "periodStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
