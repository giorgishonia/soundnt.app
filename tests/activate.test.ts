/**
 * Device activation + MAX_DEVICES enforcement + revocation (spec §7, §14).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { processPaymentWebhook } from "@/lib/services/issue";
import { registerActivation } from "@/lib/services/activations";
import { revokeLicense } from "@/lib/services/admin";
import { signLicense } from "@/lib/license";
import { makeTestDb, testKeys, seedPendingOrder, type TestKeys } from "./helpers/db";
import type { Db } from "@/lib/db/client";

let db: Db;
let keys: TestKeys;
let token: string;
let lic: string;

beforeEach(async () => {
  db = await makeTestDb();
  keys = testKeys();
  await seedPendingOrder(db, { ref: "ref-a", plan: "pro_12m", email: "buyer@x.com", amountCents: 5999 });
  const r = await processPaymentWebhook(db, {
    provider: "nowpayments",
    eventId: "pay:finished",
    orderRef: "ref-a",
    status: "paid",
    payload: {},
    signingKey: keys.priv,
  });
  token = r.license!.token;
  lic = r.license!.lic;
});

function activate(deviceId: string, maxDevices = 3) {
  return registerActivation(db, { token, deviceId, publicX: keys.pubX, maxDevices });
}

describe("device limit (cap 3)", () => {
  it("allows up to 3 distinct devices, blocks the 4th", async () => {
    const d1 = await activate("dev-1");
    expect(d1).toMatchObject({ ok: true, status: "active", devicesUsed: 1, devicesMax: 3 });

    expect(await activate("dev-2")).toMatchObject({ ok: true, devicesUsed: 2 });
    expect(await activate("dev-3")).toMatchObject({ ok: true, devicesUsed: 3 });

    const d4 = await activate("dev-4");
    expect(d4).toMatchObject({ ok: false, status: "device_limit", devicesUsed: 3, devicesMax: 3 });
  });

  it("re-activating an existing device does not consume a new slot", async () => {
    await activate("dev-1");
    await activate("dev-2");
    await activate("dev-3");
    const again = await activate("dev-1");
    expect(again).toMatchObject({ ok: true, status: "active", devicesUsed: 3 });
    // still blocks a genuinely new 4th device
    expect(await activate("dev-4")).toMatchObject({ ok: false, status: "device_limit" });
  });
});

describe("activation auth + revocation", () => {
  it("rejects a tampered/invalid token", async () => {
    const bad = await registerActivation(db, {
      token: token.slice(0, -4) + "AAAA",
      deviceId: "dev-x",
      publicX: keys.pubX,
      maxDevices: 3,
    });
    expect(bad).toEqual({ ok: false, status: "invalid" });
  });

  it("returns unknown for a validly-signed token whose lic isn't in the db", async () => {
    const { token: ghost } = signLicense({ lic: "SNDT-ZZZZZ-ZZZZZ", plan: "pro_1m" }, keys.priv);
    const r = await registerActivation(db, { token: ghost, deviceId: "dev-x", publicX: keys.pubX, maxDevices: 3 });
    expect(r).toEqual({ ok: false, status: "unknown" });
  });

  it("blocks activation once the license is revoked", async () => {
    await activate("dev-1");
    await revokeLicense(db, lic, "refund");
    const r = await activate("dev-2");
    expect(r).toEqual({ ok: false, status: "revoked" });
  });
});
