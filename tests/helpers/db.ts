/**
 * tests/helpers/db.ts — an in-memory Postgres (pglite) with the real migration
 * SQL applied, plus a fresh Ed25519 test keypair. Services are exercised against
 * genuine Postgres semantics (unique constraints, conditional updates).
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/client";
import type { Ed25519PrivateJwk } from "@/lib/license";

const MIGRATIONS_DIR = path.join(process.cwd(), "lib", "db", "migrations");

function migrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files
    .map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n")
    .replace(/-->\s*statement-breakpoint/g, "\n");
}

export async function makeTestDb(): Promise<Db> {
  const client = new PGlite(); // ephemeral, in-memory
  await client.exec(migrationSql());
  return drizzle(client, { schema }) as unknown as Db;
}

export interface TestKeys {
  priv: Ed25519PrivateJwk;
  pubX: string;
}

export function testKeys(): TestKeys {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const priv = privateKey.export({ format: "jwk" }) as Ed25519PrivateJwk;
  const pub = publicKey.export({ format: "jwk" }) as { x: string };
  return { priv, pubX: pub.x };
}

/** Insert a pending order row directly (bypasses checkout/invoice). */
export async function seedPendingOrder(
  db: Db,
  input: { ref: string; plan: string; email?: string | null; amountCents: number; deviceId?: string | null }
): Promise<void> {
  await db.insert(schema.orders).values({
    ref: input.ref,
    plan: input.plan,
    amountCents: input.amountCents,
    currency: "USD",
    status: "pending",
    provider: "nowpayments",
    deviceId: input.deviceId ?? null,
    email: input.email ?? null,
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
  });
}
