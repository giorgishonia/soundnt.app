/**
 * lib/payments/nowpayments-sig.ts — pure IPN signature logic (no env imports,
 * so it's unit-testable in isolation).
 *
 * NOWPayments signs the IPN body with HMAC-SHA512 over the JSON with keys sorted
 * recursively, using the IPN secret. We re-derive that and constant-time compare
 * against the `x-nowpayments-sig` header.
 */

import crypto from "node:crypto";

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) out[k] = sortKeysDeep(obj[k]);
    return out;
  }
  return value;
}

/** HMAC-SHA512 (hex) of the recursively key-sorted JSON of `payload`. */
export function nowpaymentsHmac(payload: unknown, ipnSecret: string): string {
  const sorted = JSON.stringify(sortKeysDeep(payload));
  return crypto.createHmac("sha512", ipnSecret).update(sorted).digest("hex");
}

/** Constant-time verify of the provided hex signature against the payload. */
export function verifyNowpaymentsSignature(
  payload: unknown,
  signatureHex: string | null | undefined,
  ipnSecret: string
): boolean {
  if (!signatureHex) return false;
  const expected = nowpaymentsHmac(payload, ipnSecret);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHex, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
