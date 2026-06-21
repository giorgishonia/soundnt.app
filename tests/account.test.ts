/**
 * Account magic links (stateless) + device deactivation authz (spec §10).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { signAccountToken, verifyAccountToken, deactivateDevice, accountLicenses } from "@/lib/services/account";
import { processPaymentWebhook } from "@/lib/services/issue";
import { registerActivation } from "@/lib/services/activations";
import { makeTestDb, testKeys, seedPendingOrder, type TestKeys } from "./helpers/db";
import type { Db } from "@/lib/db/client";

const SECRET = "account-secret-xyz";

describe("magic-link tokens", () => {
  it("round-trips and normalizes the email", () => {
    const t = signAccountToken(" Buyer@X.com ", SECRET);
    expect(verifyAccountToken(t, SECRET)).toBe("buyer@x.com");
  });

  it("rejects wrong secret, tampering, and expiry", () => {
    const t = signAccountToken("a@b.com", SECRET);
    expect(verifyAccountToken(t, "wrong")).toBeNull();
    expect(verifyAccountToken(t.slice(0, -2) + "xx", SECRET)).toBeNull();

    const expired = signAccountToken("a@b.com", SECRET, -10); // already expired
    expect(verifyAccountToken(expired, SECRET)).toBeNull();
  });
});

describe("account device management", () => {
  let db: Db;
  let keys: TestKeys;
  let lic: string;
  let token: string;

  beforeEach(async () => {
    db = await makeTestDb();
    keys = testKeys();
    await seedPendingOrder(db, { ref: "ref-acc", plan: "pro_12m", email: "owner@x.com", amountCents: 5999 });
    const r = await processPaymentWebhook(db, {
      provider: "nowpayments",
      eventId: "acc:finished",
      orderRef: "ref-acc",
      status: "paid",
      payload: {},
      signingKey: keys.priv,
    });
    lic = r.license!.lic;
    token = r.license!.token;
    await registerActivation(db, { token, deviceId: "dev-1", publicX: keys.pubX, maxDevices: 3 });
  });

  it("lets the owner deactivate a device, freeing a slot", async () => {
    const ok = await deactivateDevice(db, { email: "owner@x.com", lic, deviceId: "dev-1" });
    expect(ok).toEqual({ ok: true });
    const views = await accountLicenses(db, "owner@x.com");
    expect(views[0]!.devices.length).toBe(0);
  });

  it("refuses to deactivate a device on someone else's license", async () => {
    const r = await deactivateDevice(db, { email: "attacker@x.com", lic, deviceId: "dev-1" });
    expect(r).toEqual({ ok: false });
    const views = await accountLicenses(db, "owner@x.com");
    expect(views[0]!.devices.length).toBe(1); // unchanged
  });
});
