/**
 * lib/db/client.ts — production Drizzle client (Supabase Postgres via postgres.js).
 *
 * Connects through Supabase's Supavisor *transaction* pooler — host
 * `aws-0-<region>.pooler.supabase.com`, user `postgres.<project-ref>`, PORT 6543 —
 * which Supabase documents as "ideal for serverless or edge functions, which
 * require many transient connections" (exactly the Netlify Function model).
 *
 * IMPORTANT: the transaction pooler does NOT support prepared statements (a
 * different backend connection can serve each transaction), so postgres.js MUST
 * be created with `prepare: false`. Omitting it causes intermittent
 * "prepared statement does not exist" errors in production. This is mandatory,
 * not an optimization.
 *
 * Issuance idempotency is built on unique constraints + a single conditional
 * status-claim UPDATE (see lib/services/issue.ts) — deliberately NOT on
 * interactive transactions — so behaviour is identical here, on the transaction
 * pooler, and on pglite in tests.
 *
 * `Db` is a structural supertype so services accept both this postgres.js client
 * (prod) and the pglite client (tests). Result typing still flows from the table
 * objects passed to `.from()` / `.insert()`, so nothing is lost.
 */

import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { env } from "@/lib/env";
import * as schema from "@/lib/db/schema";

export type Db = PgDatabase<any, any, any>;

/**
 * Memoize across warm serverless invocations AND `next dev` HMR. A bare
 * module-level `let` is reset on every HMR reload, which would leak postgres
 * pools; stashing the client/db on globalThis survives that. In production each
 * warm Lambda reuses the singleton, so we open at most one client-side pool per
 * instance.
 */
const globalForDb = globalThis as unknown as {
  __soundntSql?: ReturnType<typeof postgres>;
  __soundntDb?: Db;
};

function getClient(): ReturnType<typeof postgres> {
  if (!globalForDb.__soundntSql) {
    globalForDb.__soundntSql = postgres(env.databaseUrl(), {
      // MANDATORY for the Supabase transaction pooler (port 6543): it cannot
      // persist prepared statements across pooled connections.
      prepare: false,
      // Serverless tuning: keep this instance's own pool tiny so the shared
      // Supavisor pool stays available to other concurrent function instances.
      max: 1,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      // Supavisor cold connects can be slow; give them headroom.
      connect_timeout: 15,
      // Don't spam logs with server NOTICE messages.
      onnotice: () => {},
      // TLS is driven by `?sslmode=require` in the Supabase connection string;
      // postgres.js honours sslmode from the URL, so no explicit `ssl` option
      // is needed.
    });
  }
  return globalForDb.__soundntSql;
}

export function getDb(): Db {
  if (!globalForDb.__soundntDb) {
    globalForDb.__soundntDb = drizzle(getClient(), { schema }) as unknown as Db;
  }
  return globalForDb.__soundntDb;
}

export { schema };
