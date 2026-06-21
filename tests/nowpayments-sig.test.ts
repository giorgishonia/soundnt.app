/**
 * NOWPayments IPN signature verification (spec §5): HMAC-SHA512 over recursively
 * key-sorted JSON, constant-time compared. Mismatches must be rejected.
 */

import { describe, it, expect } from "vitest";
import { nowpaymentsHmac, verifyNowpaymentsSignature, sortKeysDeep } from "@/lib/payments/nowpayments-sig";

const SECRET = "test-ipn-secret-123";

describe("nowpayments IPN signature", () => {
  const payload = {
    payment_id: 5000000000,
    payment_status: "finished",
    order_id: "ref-123",
    price_amount: 59.99,
    price_currency: "usd",
    actually_paid: 0.0021,
    nested: { b: 2, a: 1 },
  };

  it("accepts a correctly-signed payload", () => {
    const sig = nowpaymentsHmac(payload, SECRET);
    expect(verifyNowpaymentsSignature(payload, sig, SECRET)).toBe(true);
  });

  it("rejects a wrong/empty signature", () => {
    expect(verifyNowpaymentsSignature(payload, "deadbeef", SECRET)).toBe(false);
    expect(verifyNowpaymentsSignature(payload, null, SECRET)).toBe(false);
    expect(verifyNowpaymentsSignature(payload, undefined, SECRET)).toBe(false);
  });

  it("rejects a tampered payload (e.g. inflated amount)", () => {
    const sig = nowpaymentsHmac(payload, SECRET);
    const tampered = { ...payload, price_amount: 0.01 };
    expect(verifyNowpaymentsSignature(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const sig = nowpaymentsHmac(payload, "other-secret");
    expect(verifyNowpaymentsSignature(payload, sig, SECRET)).toBe(false);
  });

  it("is independent of key ordering (recursive sort)", () => {
    const reordered = {
      nested: { a: 1, b: 2 },
      actually_paid: 0.0021,
      price_currency: "usd",
      price_amount: 59.99,
      order_id: "ref-123",
      payment_status: "finished",
      payment_id: 5000000000,
    };
    expect(nowpaymentsHmac(payload, SECRET)).toBe(nowpaymentsHmac(reordered, SECRET));
  });

  it("sorts nested keys deeply", () => {
    expect(JSON.stringify(sortKeysDeep({ b: 1, a: { d: 1, c: 2 } }))).toBe('{"a":{"c":2,"d":1},"b":1}');
  });
});
