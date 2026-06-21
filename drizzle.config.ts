import { defineConfig } from "drizzle-kit";

// Migrations are generated against the Drizzle schema and applied to Postgres
// (Supabase in prod). Tests apply the same generated SQL to an in-memory pglite db.
//
// NOTE: drizzle-kit needs the Supabase DIRECT connection (port 5432), NOT the
// transaction pooler (6543) the app runs on — migrations use session features the
// pooler doesn't support. Set DIRECT_DATABASE_URL to the direct string when
// running `db:migrate`/`db:push`, or just paste supabase/schema.sql in the SQL editor.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgres://localhost:5432/soundnt",
  },
  strict: true,
  verbose: true,
});
