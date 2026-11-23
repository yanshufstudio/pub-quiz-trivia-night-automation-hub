// Loaded by the `prisma` CLI (migrate/generate/studio) — once this file
// exists, Prisma stops auto-loading `.env` itself, so that's done here
// explicitly. The Next.js app's own runtime env loading (src/lib/db.ts,
// via `next dev`/`next start`) is unaffected either way.
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma's CLI only actually uses `engine: "js"` below (the JS/driver-
// adapter schema engine, which needs no native query-engine binary) when
// this is also set — the config field alone isn't enough in this Prisma
// version. Set unconditionally: this project has no other engine mode.
process.env.PRISMA_CLIENT_ENGINE_TYPE = "client";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  experimental: {
    adapter: true,
  },
  // A driver adapter talks to the database over its own client library
  // instead of Prisma's native query-engine binary — no platform-specific
  // binary to fetch or bundle, which is what makes this work unmodified in
  // a serverless deploy's read-only/ephemeral filesystem (see the adapter
  // in src/lib/db.ts for the fuller reasoning).
  engine: "js",
  adapter: async () => {
    const { PrismaLibSQL } = await import("@prisma/adapter-libsql");
    return new PrismaLibSQL({
      // A local `file:` path (the default below) works completely
      // unmodified against a real hosted Turso database — just point
      // DATABASE_URL at `libsql://<db>-<org>.turso.io` and set
      // DATABASE_AUTH_TOKEN. See .env.example.
      url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
      authToken: process.env.DATABASE_AUTH_TOKEN,
    });
  },
});
