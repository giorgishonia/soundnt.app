/**
 * tests/demo-flow.test.ts — proves the DEMO payment path end-to-end:
 *
 *   checkout (create order) → POST /api/demo/pay (markOrderPaidTestMode mints) →
 *   GET /api/order/:ref (getOrderView returns the token) → the token verifies
 *   against the EXACT public key the desktop app embeds.
 *
 * The last step is the whole point: it guarantees the unmodified soundn't app
 * will accept a license the demo deploy mints — no app rebuild required.
 */

import { describe, it, expect } from "vitest";
import { makeTestDb } from "./helpers/db";
import { createOrderIfAbsent, getOrderView } from "@/lib/services/orders";
import { markOrderPaidTestMode } from "@/lib/services/issue";
import { verifyLicense, type Ed25519PrivateJwk } from "@/lib/license";
import { PLANS, type PlanId } from "@/lib/plans";

// The dev signing keypair shared by the site and the app. The public `x` here is
// byte-for-byte LICENSE_PUBKEY_B64 in cleanmic/src-tauri/src/license.rs, so a
// token signed with this key verifies in the shipped app binary.
const APP_EMBEDDED_PUBKEY = "YjICy5hhlXqxHsT7pZoe3AXUPqghplWYP48GPOG4YOI";
const DEV_SIGNING_KEY: Ed25519PrivateJwk = {
  kty: "OKP",
  crv: "Ed25519",
  x: APP_EMBEDDED_PUBKEY,
  d: "f0WscM8gsx9LHWMR9p6u3GPwtVJZXJAWDRrHBLvnhA8",
};

describe("demo payment flow (no real crypto)", () => {
  it("mints an app-verifiable license for every plan via the demo path", async () => {
    for (const plan of Object.keys(PLANS) as PlanId[]) {
      const db = await makeTestDb();
      const ref = `demo-ref-${plan}`;

      // 1. Checkout creates the order (provider = "demo").
      const { created } = await createOrderIfAbsent(db, {
        ref,
        plan,
        amountCents: PLANS[plan].amountCents,
        provider: "demo",
        deviceId: "device-abc",
        email: "buyer@example.com",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      expect(created).toBe(true);

      // Before "payment", the poller must NOT get a token.
      expect((await getOrderView(db, ref))?.status).toBe("pending");

      // 2. The demo-pay endpoint marks it paid + mints (no real payment).
      const result = await markOrderPaidTestMode(db, ref, DEV_SIGNING_KEY);
      expect(result.outcome).toBe("minted");

      // 3. The app's poll now returns the signed token.
      const view = await getOrderView(db, ref);
      expect(view?.status).toBe("paid");
      const token = view?.license?.token;
      expect(token).toBeTruthy();

      // 4. THE CONTRACT: the token verifies under the app's embedded pubkey.
      const decoded = verifyLicense(token!, APP_EMBEDDED_PUBKEY);
      expect(decoded.plan).toBe(plan);
      expect(decoded.term_months).toBe(PLANS[plan].termMonths);
      expect(decoded.email).toBe("buyer@example.com");
      expect(decoded.exp).toBe(decoded.iat + PLANS[plan].days * 86400);
    }
  });

  it("refuses to mint an order whose pending TTL has passed (no reviving dead links)", async () => {
    const db = await makeTestDb();
    const ref = "demo-ref-expired";
    await createOrderIfAbsent(db, {
      ref,
      plan: "pro_12m",
      amountCents: PLANS.pro_12m.amountCents,
      provider: "demo",
      expiresAt: new Date(Date.now() - 1000), // already past its TTL
    });

    const result = await markOrderPaidTestMode(db, ref, DEV_SIGNING_KEY);
    expect(result.outcome).toBe("expired");
    expect(result.license).toBeUndefined();

    // And the poller must never see a token for it.
    const view = await getOrderView(db, ref);
    expect(view?.status).toBe("expired");
  });

  it("is idempotent: a second demo-pay returns the same license, no double-mint", async () => {
    const db = await makeTestDb();
    const ref = "demo-ref-idem";
    await createOrderIfAbsent(db, {
      ref,
      plan: "pro_12m",
      amountCents: PLANS.pro_12m.amountCents,
      provider: "demo",
      expiresAt: new Date(Date.now() + 3600 * 1000),
    });

    const first = await markOrderPaidTestMode(db, ref, DEV_SIGNING_KEY);
    const second = await markOrderPaidTestMode(db, ref, DEV_SIGNING_KEY);

    expect(first.outcome).toBe("minted");
    expect(second.outcome).toBe("already");
    expect(second.license?.lic).toBe(first.license?.lic);
  });
});
