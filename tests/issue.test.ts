/**
 * Issuance + webhook idempotency (spec §6, §14): a paid webhook mints exactly
 * one license, replays never double-mint, and minted tokens verify with the
 * matching key.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { processPaymentWebhook } from "@/lib/services/issue";
import { getOrderView } from "@/lib/services/orders";
import { verifyLicense } from "@/lib/license";
import { licenses, orders } from "@/lib/db/schema";
import { PLANS } from "@/lib/plans";
import { makeTestDb, testKeys, seedPendingOrder, type TestKeys } from "./helpers/db";
import type { Db } from "@/lib/db/client";

let db: Db;
let keys: TestKeys;

beforeEach(async () => {
  db = await makeTestDb();
  keys = testKeys();
});

function webhook(ref: string, status: "paid" | "pending" | "failed", eventId: string, priceUsd?: number) {
  return processPaymentWebhook(db, {
    provider: "nowpayments",
    eventId,
    orderRef: ref,
    status,
    priceAmountUsd: priceUsd,
    payload: { ref, eventId },
    signingKey: keys.priv,
  });
}

describe("license issuance", () => {
  it("mints exactly one license on a paid webhook, with a verifiable token", async () => {
    await seedPendingOrder(db, { ref: "ref-1", plan: "pro_12m", email: "buyer@x.com", amountCents: 5999 });
    const r = await webhook("ref-1", "paid", "pay_1:finished", 59.99);

    expect(r.outcome).toBe("minted");
    expect(r.license).toBeDefined();
    expect(r.license!.lic).toMatch(/^SNDT-/);
    expect(r.license!.plan).toBe("pro_12m");
    expect(r.license!.exp).toBe(r.license!.iat + PLANS.pro_12m.days * 86400);

    const decoded = verifyLicense(r.license!.token, keys.pubX);
    expect(decoded.lic).toBe(r.license!.lic);
    expect(decoded.email).toBe("buyer@x.com");

    const all = await db.select().from(licenses);
    expect(all.length).toBe(1);
  });

  it("is idempotent: replaying the same event mints no second license", async () => {
    await seedPendingOrder(db, { ref: "ref-2", plan: "pro_1m", amountCents: 799 });
    const first = await webhook("ref-2", "paid", "pay_2:finished");
    const replay = await webhook("ref-2", "paid", "pay_2:finished");

    expect(first.outcome).toBe("minted");
    expect(replay.outcome).toBe("already");
    expect(replay.license!.lic).toBe(first.license!.lic);

    const all = await db.select().from(licenses);
    expect(all.length).toBe(1);
  });

  it("does not double-mint across different status deliveries of one payment", async () => {
    await seedPendingOrder(db, { ref: "ref-3", plan: "pro_3m", amountCents: 1999 });
    await webhook("ref-3", "pending", "pay_3:confirming");
    const a = await webhook("ref-3", "paid", "pay_3:confirmed");
    const b = await webhook("ref-3", "paid", "pay_3:finished");

    expect(a.outcome).toBe("minted");
    expect(b.outcome).toBe("already");
    const all = await db.select().from(licenses);
    expect(all.length).toBe(1);
  });

  it("exposes the token via getOrderView only after payment", async () => {
    await seedPendingOrder(db, { ref: "ref-4", plan: "pro_6m", amountCents: 3599 });
    const before = await getOrderView(db, "ref-4");
    expect(before?.status).toBe("pending");
    expect(before?.license).toBeUndefined();

    await webhook("ref-4", "paid", "pay_4:finished");
    const after = await getOrderView(db, "ref-4");
    expect(after?.status).toBe("paid");
    expect(after?.license?.token).toBeTruthy();
  });

  it("ignores webhooks for unknown orders", async () => {
    const r = await webhook("does-not-exist", "paid", "pay_x:finished");
    expect(r.outcome).toBe("no_order");
  });

  it("marks an order failed on a failed webhook, but never un-pays a paid one", async () => {
    await seedPendingOrder(db, { ref: "ref-5", plan: "pro_1m", amountCents: 799 });
    const f = await webhook("ref-5", "failed", "pay_5:expired");
    expect(f.outcome).toBe("failed");
    // getOrderView reports the service-level status; the HTTP route maps it to "expired".
    expect((await getOrderView(db, "ref-5"))?.status).toBe("failed");

    await seedPendingOrder(db, { ref: "ref-6", plan: "pro_1m", amountCents: 799 });
    await webhook("ref-6", "paid", "pay_6:finished");
    await webhook("ref-6", "failed", "pay_6:refunded");
    expect((await getOrderView(db, "ref-6"))?.status).toBe("paid"); // stays paid
  });

  it("recovers a paid-but-unminted (stranded) order on a later webhook", async () => {
    // Simulate a crash between the pending→paid claim and the license insert:
    // the order is paid with no license attached.
    await seedPendingOrder(db, { ref: "ref-7", plan: "pro_3m", amountCents: 1999 });
    await db.update(orders).set({ status: "paid", paidAt: new Date() }).where(eq(orders.ref, "ref-7"));
    expect((await getOrderView(db, "ref-7"))?.status).toBe("pending"); // no token yet

    const r = await webhook("ref-7", "paid", "pay_7:finished");
    expect(r.outcome).toBe("minted");
    expect((await getOrderView(db, "ref-7"))?.license?.token).toBeTruthy();
    expect((await db.select().from(licenses)).length).toBe(1);
  });

  it("refuses to mint an underpaid order (actually_paid < pay_amount)", async () => {
    await seedPendingOrder(db, { ref: "ref-8", plan: "pro_12m", amountCents: 5999 });
    const r = await processPaymentWebhook(db, {
      provider: "nowpayments",
      eventId: "pay_8:finished",
      orderRef: "ref-8",
      status: "paid",
      actuallyPaid: 0.4,
      payAmount: 1.0,
      payload: {},
      signingKey: keys.priv,
    });
    expect(r.outcome).toBe("pending");
    expect((await db.select().from(licenses)).length).toBe(0);

    // A subsequent full payment still mints.
    const ok = await processPaymentWebhook(db, {
      provider: "nowpayments",
      eventId: "pay_8:confirmed",
      orderRef: "ref-8",
      status: "paid",
      actuallyPaid: 1.0,
      payAmount: 1.0,
      payload: {},
      signingKey: keys.priv,
    });
    expect(ok.outcome).toBe("minted");
  });
});
