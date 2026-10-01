import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

/**
 * `reviewNotes` is support data about a generated pack (ACC2) — which
 * questions the review changed and why — and is never meant for the host's
 * browser. Several pages and routes hand whole pack rows to the client, so it
 * is left out of every query here rather than at each of them; read it with
 * an explicit `omit: { reviewNotes: false }`.
 */
const OMIT = { quizPack: { reviewNotes: true } } as const;

/**
 * A libSQL-backed client is the same code path locally and in production:
 * a local `file:` path (the default, unset DATABASE_URL) or a real hosted
 * Turso database (DATABASE_URL=libsql://..., DATABASE_AUTH_TOKEN set) — see
 * .env.example. This replaces Prisma's previous native query-engine binary,
 * which needs a writable local file on disk and doesn't survive a
 * serverless deploy's ephemeral/read-only filesystem or per-invocation cold
 * starts (see prisma.config.ts for the CLI side of this same change).
 */
function createClient() {
  const adapter = new PrismaLibSQL({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter, omit: OMIT });
}

type Db = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: Db | undefined;
};

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
