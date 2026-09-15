-- AlterTable
ALTER TABLE "Creator" ADD COLUMN "email" TEXT;
ALTER TABLE "Creator" ADD COLUMN "paddleCustomerId" TEXT;
ALTER TABLE "Creator" ADD COLUMN "paddleSubscriptionId" TEXT;
ALTER TABLE "Creator" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Creator" ADD COLUMN "subscriptionUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "PaddleEvent" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RestoreToken" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "creatorId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    CONSTRAINT "RestoreToken_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "Creator" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Creator_email_key" ON "Creator"("email");
CREATE UNIQUE INDEX "Creator_paddleSubscriptionId_key" ON "Creator"("paddleSubscriptionId");
CREATE INDEX "RestoreToken_creatorId_idx" ON "RestoreToken"("creatorId");
