-- Host accounts (Better Auth) + the link from a Creator to one.
--
-- Written by hand, as every migration in this repo is: `prisma migrate dev`
-- cannot replay this history in driver-adapter mode (it fails on "no such
-- table: Session"). The four Better Auth tables below came from
--   npx prisma migrate diff --from-schema-datamodel <master's schema> \
--                           --to-schema-datamodel prisma/schema.prisma --script
-- with only the Creator section rewritten; see the note above it.
--
-- Purely additive: four new tables, one new nullable column, and indexes.
-- Nothing existing is dropped, rebuilt or rewritten, so this is safe to run
-- against production data while the old cookie path is still serving.
--
-- "authSession", not "session": Session is already this schema's *game*
-- session, the row behind a five-character join code. See AUTH_SESSION_MODEL
-- in src/lib/auth.ts.

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "authSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "authSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- AlterTable
--
-- `prisma migrate diff` emits a RedefineTables block here: build new_Creator,
-- copy every row across, DROP TABLE "Creator", rename. That is Prisma's
-- generic answer to "SQLite cannot ALTER a constraint", and it is not needed
-- for this change. SQLite does allow ADD COLUMN with a REFERENCES clause as
-- long as the new column's default is NULL, which this one's is — and a
-- UNIQUE index can simply be created afterwards.
--
-- Hand-written on purpose, therefore. The generated version would drop and
-- recreate the table that owns every pack in production, which is a risk
-- worth exactly nothing here: the two statements below leave every existing
-- row untouched and in place.
ALTER TABLE "Creator" ADD COLUMN "userId" TEXT REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
-- One creator per account, enforced by the database rather than by the code
-- that claims cookies. NULLs are all distinct in SQLite, so every unclaimed
-- pre-accounts Creator still coexists happily under this index.
CREATE UNIQUE INDEX "Creator_userId_key" ON "Creator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "authSession_userId_idx" ON "authSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "authSession_token_key" ON "authSession"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

