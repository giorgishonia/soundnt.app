/**
 * lib/db/client.ts — production Drizzle client (Neon serverless, HTTP driver).
 *
 * The HTTP driver is stateless and ideal for Vercel serverless functions. It
 * does NOT support interactive transactions — so issuance idempotency is built
 * on unique constraints + a conditional status-claim UPDATE (see lib/services/
 * issue.ts), which works identically here and on pglite in tests.
 *
 * `Db` is a structural supertype so services accept both the Neon client (prod)
 * and the pglite client (tests). Result typing still flows from the table
 * objects passed to `.from()` / `.insert()`, so nothing is lost.
 */

import "server-only";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { env } from "@/lib/env";
import * as schema from "@/lib/db/schema";

export type Db = PgDatabase<any, any, any>;

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const sql = neon(env.databaseUrl());
    _db = drizzle(sql, { schema }) as unknown as Db;
  }
  return _db;
}

export { schema };
