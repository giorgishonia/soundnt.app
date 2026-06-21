/**
 * Revocation/expiry truth (spec §7, §14): /api/validate reflects revoked,
 * expired, active, unknown.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { processPaymentWebhook } from "@/lib/services/issue";
import { validateLicense } from "@/lib/services/validate";
import { registerActivation } from "@/lib/services/activations";
import { revokeLicense } from "@/lib/services/admin";
import { licenses } from "@/lib/db/schema";
import { makeTestDb, testKeys, seedPendingOrder, type TestKeys } from "./helpers/db";
import type { Db } from "@/lib/db/client";

let db: Db;
let keys: TestKeys;

beforeEach(async () => {
  db = await makeTestDb();
  keys = testKeys();
});

async function mint(ref: string, plan = "pro_12m") {
  await seedPendingOrder(db, { ref, plan, email: "b@x.com", amountCents: 5999 });
  const r = await processPaymentWebhook(db, {
    provider: "nowpayments",
    eventId: `${ref}:finished`,
    orderRef: ref,
    status: "paid",
    payload: {},
    signingKey: keys.priv,
  });
  return r.license!;
}

describe("validateLicense", () => {
  it("returns active for a fresh license", async () => {
    const l = await mint("ref-v1");
    const r = await validateLicense(db, { lic: l.lic });
    expect(r.status).toBe("active");
    expect(r.exp).toBe(l.exp);
  });

  it("returns unknown for an unminted lic", async () => {
    expect(await validateLicense(db, { lic: "SNDT-ZZZZZ-ZZZZZ" })).toEqual({ status: "unknown" });
  });

  it("returns revoked after admin revocation", async () => {
    const l = await mint("ref-v2");
    await revokeLicense(db, l.lic, "chargeback");
    const r = await validateLicense(db, { lic: l.lic });
    expect(r.status).toBe("revoked");
  });

  it("returns expired for a past exp", async () => {
    const l = await mint("ref-v3");
    await db
      .update(licenses)
      .set({ exp: Math.floor(Date.now() / 1000) - 10 })
      .where(eq(licenses.lic, l.lic));
    const r = await validateLicense(db, { lic: l.lic });
    expect(r.status).toBe("expired");
  });

  it("bumps a device heartbeat without error", async () => {
    const l = await mint("ref-v4");
    await registerActivation(db, { token: l.token, deviceId: "dev-1", publicX: keys.pubX, maxDevices: 3 });
    const r = await validateLicense(db, { lic: l.lic, deviceId: "dev-1" });
    expect(r.status).toBe("active");
  });
});
