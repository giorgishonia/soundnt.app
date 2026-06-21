#!/usr/bin/env node
/**
 * tools/db-setup.mjs — apply supabase/schema.sql to DATABASE_URL and verify.
 *
 * Idempotent: safe to run repeatedly. Uses the same postgres.js client config as
 * the app (prepare:false) so it works against the Supabase transaction pooler.
 *
 *   node --env-file=.env.local tools/db-setup.mjs
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set. Run: node --env-file=.env.local tools/db-setup.mjs");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const ddl = readFileSync(path.join(here, "..", "supabase", "schema.sql"), "utf8");

const where = (() => {
  try { const u = new URL(url); return `${u.hostname}:${u.port}`; } catch { return "(unparseable url)"; }
})();
console.log(`\napplying supabase/schema.sql → ${where}\n`);

const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 20, onnotice: () => {} });

try {
  // Simple protocol allows the multi-statement DDL file (incl. the DO $do$ block).
  await sql.unsafe(ddl).simple();
  console.log("✓ schema applied (idempotent)\n");

  const tables = await sql`
    select tablename, rowsecurity
    from pg_tables
    where schemaname = 'public'
      and tablename in ('activations','licenses','orders','webhook_events')
    order by tablename`;
  console.log("tables + row-level security:");
  for (const t of tables) console.log(`  ${t.rowsecurity ? "🔒" : "⚠️"} ${t.tablename}  (rls=${t.rowsecurity})`);

  const fp = await sql`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'activations' and column_name = 'fingerprint'`;
  console.log(`\nactivations.fingerprint column : ${fp.length ? "present ✓" : "MISSING ✗"}`);

  const fks = await sql`
    select conname from pg_constraint
    where conname in ('activations_license_id_licenses_id_fk','orders_license_id_licenses_id_fk')`;
  console.log(`foreign keys                   : ${fks.length}/2 present ${fks.length === 2 ? "✓" : "✗"}`);

  const idx = await sql`
    select count(*)::int as n from pg_indexes
    where schemaname = 'public' and tablename in ('activations','licenses','orders','webhook_events')`;
  console.log(`indexes on the 4 tables        : ${idx[0].n}`);

  const ok = tables.length === 4 && tables.every((t) => t.rowsecurity) && fp.length === 1 && fks.length === 2;
  console.log(ok ? "\n✓ DATABASE READY — all 4 tables, RLS on, fingerprint + FKs present.\n"
                 : "\n✗ verification incomplete — see above.\n");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  console.error("\n✗ failed:", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
