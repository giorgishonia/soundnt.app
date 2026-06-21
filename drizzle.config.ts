import { defineConfig } from "drizzle-kit";

// Migrations are generated against the Drizzle schema and applied to Postgres
// (Neon in prod). Tests apply the same generated SQL to an in-memory pglite db.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/soundnt",
  },
  strict: true,
  verbose: true,
});
