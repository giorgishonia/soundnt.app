/**
 * lib/services/admin.ts — ops dashboard data + revocation (spec §7 admin).
 *
 * Who-bought / who-activated visibility: per license you can see the buying
 * device (orders.device_id), all activated devices, last-seen heartbeats, email,
 * plan, amount, order, and status. Revoking flips /api/validate to "revoked".
 */

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { activations, licenses, orders } from "@/lib/db/schema";
import type { Activation, License, Order } from "@/lib/db/schema";

/** Clamp a possibly-NaN limit/offset to a safe integer (never reaches SQL as NaN). */
function safeLimit(v: number | undefined, fallback: number, max: number): number {
  return Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v!), 1), max) : fallback;
}
function safeOffset(v: number | undefined): number {
  return Number.isFinite(v) ? Math.max(Math.trunc(v!), 0) : 0;
}

export async function listOrders(
  db: Db,
  opts: { limit?: number; offset?: number; status?: string } = {}
): Promise<Order[]> {
  const limit = safeLimit(opts.limit, 50, 200);
  const where = opts.status ? eq(orders.status, opts.status) : undefined;
  return db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(limit)
    .offset(safeOffset(opts.offset));
}

export async function listLicenses(
  db: Db,
  opts: { limit?: number; offset?: number; q?: string } = {}
): Promise<License[]> {
  const limit = safeLimit(opts.limit, 50, 200);
  const q = opts.q?.trim();
  const where = q
    ? or(ilike(licenses.lic, `%${q}%`), ilike(licenses.email, `%${q}%`), ilike(licenses.orderRef, `%${q}%`))
    : undefined;
  return db
    .select()
    .from(licenses)
    .where(where)
    .orderBy(desc(licenses.createdAt))
    .limit(limit)
    .offset(safeOffset(opts.offset));
}

export interface LicenseDetail {
  license: License;
  order: Order | null;
  devices: Activation[];
}

export async function getLicenseDetail(db: Db, lic: string): Promise<LicenseDetail | null> {
  const lrows = await db.select().from(licenses).where(eq(licenses.lic, lic)).limit(1);
  const license = lrows[0];
  if (!license) return null;

  const devices = await db
    .select()
    .from(activations)
    .where(eq(activations.licenseId, license.id))
    .orderBy(desc(activations.lastSeen));

  let order: Order | null = null;
  if (license.orderRef) {
    const orows = await db.select().from(orders).where(eq(orders.ref, license.orderRef)).limit(1);
    order = orows[0] ?? null;
  }

  return { license, order, devices };
}

export async function revokeLicense(
  db: Db,
  lic: string,
  reason: string
): Promise<License | null> {
  const updated = await db
    .update(licenses)
    .set({ status: "revoked", revokedAt: new Date(), revokeReason: reason })
    .where(and(eq(licenses.lic, lic)))
    .returning();
  return updated[0] ?? null;
}

export interface RevenueRollup {
  totals: { paidOrders: number; revenueCents: number };
  byPlan: Array<{ plan: string; count: number; revenueCents: number }>;
  byDay: Array<{ day: string; count: number; revenueCents: number }>;
}

export async function revenueRollup(db: Db): Promise<RevenueRollup> {
  const byPlanRows = await db
    .select({
      plan: orders.plan,
      count: sql<number>`count(*)::int`,
      revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
    })
    .from(orders)
    .where(eq(orders.status, "paid"))
    .groupBy(orders.plan);

  const byDayRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${orders.paidAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenueCents: sql<number>`coalesce(sum(${orders.amountCents}), 0)::int`,
    })
    .from(orders)
    .where(eq(orders.status, "paid"))
    .groupBy(sql`date_trunc('day', ${orders.paidAt})`)
    .orderBy(sql`date_trunc('day', ${orders.paidAt}) desc`)
    .limit(30);

  const paidOrders = byPlanRows.reduce((a, r) => a + Number(r.count), 0);
  const revenueCents = byPlanRows.reduce((a, r) => a + Number(r.revenueCents), 0);

  return {
    totals: { paidOrders, revenueCents },
    byPlan: byPlanRows.map((r) => ({ plan: r.plan, count: Number(r.count), revenueCents: Number(r.revenueCents) })),
    byDay: byDayRows.map((r) => ({ day: r.day, count: Number(r.count), revenueCents: Number(r.revenueCents) })),
  };
}
