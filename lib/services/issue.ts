/**
 * lib/services/issue.ts — license issuance (spec §6, "the heart").
 *
 * Idempotency without interactive transactions:
 *   1. webhook_events has unique(provider, event_id) — dedups identical
 *      provider re-deliveries.
 *   2. A conditional UPDATE claims the order pending→paid exactly once (Postgres
 *      row-locks serialize concurrent claims). Only the winner mints.
 *   3. A paid order with a license_id short-circuits — never double-mint.
 *
 * The signing key is passed in (never imported), so this is fully testable.
 */

import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { orders, licenses, webhookEvents } from "@/lib/db/schema";
import type { Order, License } from "@/lib/db/schema";
import { requirePlan, type PlanId } from "@/lib/plans";
import { signLicense, type Ed25519PrivateJwk } from "@/lib/license";
import { newLicenseId } from "@/lib/ids";
import { log } from "@/lib/log";
import type { ProviderName, WebhookStatus } from "@/lib/payments/provider";

export interface WebhookInput {
  provider: ProviderName;
  eventId: string;
  orderRef: string;
  status: WebhookStatus;
  priceAmountUsd?: number;
  /** Crypto actually received (NOWPayments `actually_paid`). */
  actuallyPaid?: number;
  /** Crypto required by the invoice (NOWPayments `pay_amount`). */
  payAmount?: number;
  payload: unknown;
  signingKey: Ed25519PrivateJwk;
}

export type IssueOutcome =
  | "minted"
  | "already"
  | "pending"
  | "failed"
  | "expired"
  | "no_order";

export interface IssueResult {
  outcome: IssueOutcome;
  license?: License;
}

/** Generate a unique license row for a paid order and attach it. */
async function mintForOrder(
  db: Db,
  order: Order,
  signingKey: Ed25519PrivateJwk
): Promise<License> {
  const planId = order.plan as PlanId;
  const plan = requirePlan(planId); // throws on unknown plan (validated at checkout)

  for (let attempt = 0; attempt < 6; attempt++) {
    const lic = newLicenseId();
    const { token, payload } = signLicense(
      { lic, plan: planId, email: order.email },
      signingKey
    );

    const inserted = await db
      .insert(licenses)
      .values({
        lic,
        plan: planId,
        termMonths: plan.termMonths,
        days: plan.days,
        email: order.email ?? null,
        token,
        iat: payload.iat,
        exp: payload.exp,
        status: "active",
        orderRef: order.ref,
      })
      .onConflictDoNothing({ target: licenses.lic })
      .returning();

    const row = inserted[0];
    if (!row) continue; // lic collision (astronomically rare) — regenerate

    await db.update(orders).set({ licenseId: row.id }).where(eq(orders.ref, order.ref));
    log.info("license minted", { lic, ref: order.ref, plan: planId });
    return row;
  }
  throw new Error("could not generate a unique license id after retries");
}

async function loadLicenseById(db: Db, id: string): Promise<License | undefined> {
  const rows = await db.select().from(licenses).where(eq(licenses.id, id)).limit(1);
  return rows[0];
}

/**
 * Claim the order pending→paid (once) and mint. If we lose the race, return the
 * winner's license (or `already` with none if it hasn't attached yet).
 */
async function claimAndMint(
  db: Db,
  order: Order,
  signingKey: Ed25519PrivateJwk
): Promise<IssueResult> {
  // Already minted?
  if (order.status === "paid" && order.licenseId) {
    const existing = await loadLicenseById(db, order.licenseId);
    return { outcome: "already", license: existing };
  }

  // A genuine (late) payment confirmation can arrive after we'd already lazily
  // TTL-expired the order. We still honor it — the buyer paid — but the demo/test
  // mint path guards against this upstream (markOrderPaidTestMode), so reaching
  // here with an expired order means a real provider confirmation. Log it so the
  // expiry override is auditable rather than silent.
  if (order.status === "expired") {
    log.warn("minting an expired order on a late paid confirmation", { ref: order.ref });
  }

  const claimed = await db
    .update(orders)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(orders.ref, order.ref), ne(orders.status, "paid")))
    .returning({ id: orders.id });

  if (claimed.length === 0) {
    // Lost the race, OR the order was already claimed paid. Re-read it.
    const fresh = await db.select().from(orders).where(eq(orders.ref, order.ref)).limit(1);
    const o = fresh[0];
    if (o?.licenseId) {
      const existing = await loadLicenseById(db, o.licenseId);
      return { outcome: "already", license: existing };
    }
    if (o && o.status === "paid") {
      // Paid but no license attached: a prior attempt claimed the order then
      // crashed / failed its HTTP round-trip before inserting the license. The
      // Neon HTTP driver has no interactive transactions, so the claim and the
      // mint are separate commits — without this branch such an order would be
      // permanently stranded (paid, no license, no recovery). mintForOrder is
      // idempotent on `lic`, so re-minting converges the order safely.
      const license = await mintForOrder(db, o, signingKey);
      return { outcome: "minted", license };
    }
    return { outcome: "already" };
  }

  const license = await mintForOrder(db, order, signingKey);
  return { outcome: "minted", license };
}

/**
 * Process a verified provider webhook. Idempotent; safe to call repeatedly with
 * the same eventId (the order-status claim guarantees a single mint).
 */
export async function processPaymentWebhook(
  db: Db,
  input: WebhookInput
): Promise<IssueResult> {
  // 1. Idempotency log (dedup identical re-deliveries). Continue regardless —
  //    the order-status claim is the real money guard.
  await db
    .insert(webhookEvents)
    .values({
      provider: input.provider,
      eventId: input.eventId,
      payload: input.payload as object,
      processed: false,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.eventId] });

  // 2. Load the order.
  const rows = await db.select().from(orders).where(eq(orders.ref, input.orderRef)).limit(1);
  const order = rows[0];
  if (!order) {
    log.warn("webhook for unknown order", { ref: input.orderRef, provider: input.provider });
    return { outcome: "no_order" };
  }

  const finish = async (result: IssueResult): Promise<IssueResult> => {
    await db
      .update(webhookEvents)
      .set({ processed: true })
      .where(and(eq(webhookEvents.provider, input.provider), eq(webhookEvents.eventId, input.eventId)));
    return result;
  };

  // 3. Map status → action.
  if (input.status === "failed") {
    // Never fail an already-paid order.
    if (order.status !== "paid") {
      await db
        .update(orders)
        .set({ status: "failed" })
        .where(and(eq(orders.ref, order.ref), ne(orders.status, "paid")));
    }
    return finish({ outcome: "failed" });
  }

  if (input.status === "pending") {
    return finish({ outcome: "pending" });
  }

  // status === "paid"
  if (
    input.priceAmountUsd != null &&
    Math.round(input.priceAmountUsd * 100) !== order.amountCents
  ) {
    // price_amount is the fiat invoice price we set ourselves, so a mismatch is
    // anomalous (HMAC already verified the body). Refuse rather than mint a term
    // the buyer didn't pay for.
    log.warn("webhook price_amount != order amount — not minting", {
      ref: order.ref,
      orderAmountCents: order.amountCents,
      webhookAmountCents: Math.round(input.priceAmountUsd * 100),
    });
    return finish({ outcome: "pending" });
  }

  // Underpayment guard: a payment can be reported finished/confirmed while the
  // received crypto is short of what the invoice required (tolerance/fee edge
  // cases). When we have both figures, require received >= required before minting.
  if (
    input.actuallyPaid != null &&
    input.payAmount != null &&
    Number.isFinite(input.actuallyPaid) &&
    Number.isFinite(input.payAmount) &&
    input.actuallyPaid < input.payAmount
  ) {
    log.warn("underpaid order — not minting", {
      ref: order.ref,
      actuallyPaid: input.actuallyPaid,
      payAmount: input.payAmount,
    });
    return finish({ outcome: "pending" });
  }

  const result = await claimAndMint(db, order, input.signingKey);
  return finish(result);
}

/**
 * TEST_MODE / ops escape hatch: mark a pending order paid and mint a license
 * WITHOUT a real payment. Gated by ALLOW_TEST_MODE at the route layer.
 */
export async function markOrderPaidTestMode(
  db: Db,
  ref: string,
  signingKey: Ed25519PrivateJwk
): Promise<IssueResult> {
  const rows = await db.select().from(orders).where(eq(orders.ref, ref)).limit(1);
  const order = rows[0];
  if (!order) return { outcome: "no_order" };

  // Unlike a real payment, the demo/test mint must NOT revive a dead order — the
  // demo invoice link is stable, so without this an aged link reopened after the
  // pending-order TTL would still hand out a license. Honor the TTL explicitly.
  if (order.status === "expired" || order.status === "failed") {
    return { outcome: "expired" };
  }
  if (
    order.status === "pending" &&
    order.expiresAt &&
    order.expiresAt.getTime() < Date.now()
  ) {
    // Past TTL but not yet lazily flipped (getOrderView does that on read): flip
    // it now and refuse — same effect as if the poller had expired it first.
    await db
      .update(orders)
      .set({ status: "expired" })
      .where(and(eq(orders.ref, ref), eq(orders.status, "pending")));
    return { outcome: "expired" };
  }

  return claimAndMint(db, order, signingKey);
}
