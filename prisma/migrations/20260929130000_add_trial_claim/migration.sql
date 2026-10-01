-- One Pro trial per account and per mailbox (PRC8).
--
-- Purely additive: a new table, nothing on an existing one changes. No foreign
-- key to Creator on purpose — the row must outlive account deletion, or a
-- second trial would be one "delete my account" away. mailboxKey is a sha256
-- digest of the normalised mailbox, never the address.
CREATE TABLE "TrialClaim" (
    "mailboxKey" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "TrialClaim_creatorId_key" ON "TrialClaim"("creatorId");
