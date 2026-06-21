/**
 * lib/services/orders.ts — order creation + the order "view" the app polls.
 *
 * Services are framework- and env-agnostic: they take a `Db` and explicit inputs
 * so they can be unit-tested against pglite. Route handlers wire env → services.
 */

import { and, eq, lt } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { orders, licenses } from "@/lib/db/schema";
import type { Order, License } from "@/lib/db/schema";
import type { PlanId } from "@/lib/plans";
import type { ProviderName } from "@/lib/payments/provider";

export interface CreateOrderInput {
  ref: string;
  plan: PlanId;
  amountCents: number;
  provider: ProviderName;
  deviceId?: string | null;
  email?: string | null;
  appVersion?: string | null;
  expiresAt: Date;
}

export async function findOrderByRef(db: Db, ref: string): Promise<Order | undefined> {
  const rows = await db.select().from(orders).where(eq(orders.ref, ref)).limit(1);
  return rows[0];
}

/**
 * Insert the order if its ref is new; always return the current row. Idempotent
 * on `ref` (the unique constraint guarantees a single order per checkout).
 */
export async function createOrderIfAbsent(
  db: Db,
  input: CreateOrderInput
): Promise<{ order: Order; created: boolean }> {
  const inserted = await db
    .insert(orders)
    .values({
      ref: input.ref,
      plan: input.plan,
      amountCents: input.amountCents,
      currency: "USD",
      status: "pending",
      provider: input.provider,
      deviceId: input.deviceId ?? null,
      email: input.email ?? null,
      appVersion: input.appVersion ?? null,
      expiresAt: input.expiresAt,
    })
    .onConflictDoNothing({ target: orders.ref })
    .returning();

  if (inserted[0]) return { order: inserted[0], created: true };

  const existing = await findOrderByRef(db, input.ref);
  if (!existing) throw new Error("order insert raced and vanished"); // should never happen
  return { order: existing, created: false };
}

/** Record the provider invoice on the order (after createInvoice succeeds). */
export async function attachInvoice(
  db: Db,
  ref: string,
  provider: ProviderName,
  invoiceId: string,
  invoiceUrl: string
): Promise<void> {
  await db
    .update(orders)
    .set({ provider, providerInvoiceId: invoiceId, providerInvoiceUrl: invoiceUrl })
    .where(eq(orders.ref, ref));
}

export interface OrderView {
  status: "pending" | "paid" | "expired" | "failed";
  license?: {
    token: string;
    lic: string;
    plan: string;
    exp: number;
    email: string | null;
  };
}

/**
 * The shape GET /api/order/:ref returns. Lazily expires stale pending orders.
 * Only returns a token for a genuinely paid order with a minted license.
 */
export async function getOrderView(db: Db, ref: string): Promise<OrderView | null> {
  const order = await findOrderByRef(db, ref);
  if (!order) return null;

  // Lazily flip pending→expired once the TTL has passed.
  if (order.status === "pending" && order.expiresAt && order.expiresAt.getTime() < Date.now()) {
    await db
      .update(orders)
      .set({ status: "expired" })
      .where(and(eq(orders.ref, ref), eq(orders.status, "pending"), lt(orders.expiresAt, new Date())));
    return { status: "expired" };
  }

  if (order.status === "paid" && order.licenseId) {
    const lrows = await db
      .select()
      .from(licenses)
      .where(eq(licenses.id, order.licenseId))
      .limit(1);
    const lic: License | undefined = lrows[0];
    if (lic && lic.status === "active") {
      return {
        status: "paid",
        license: {
          token: lic.token,
          lic: lic.lic,
          plan: lic.plan,
          exp: lic.exp,
          email: lic.email,
        },
      };
    }
    // Paid but license revoked/refunded ⇒ treat as failed for the poller.
    return { status: "failed" };
  }

  if (order.status === "failed") return { status: "failed" };
  if (order.status === "expired") return { status: "expired" };
  return { status: "pending" };
}
