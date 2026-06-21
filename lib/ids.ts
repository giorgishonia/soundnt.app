/**
 * lib/ids.ts — id helpers.
 *
 *  - `lic`: "SNDT-XXXXX-XXXXX" (Crockford base32, no ambiguous chars) — the
 *    human-facing support/revocation key.
 *  - `ref`: a 128-bit random UUID; a bearer capability for GET /api/order/:ref.
 */

import crypto from "node:crypto";

// Crockford base32: excludes I, L, O, U to avoid ambiguity.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function group5(): string {
  let out = "";
  for (let i = 0; i < 5; i++) {
    // crypto.randomInt is unbiased over [0, 32).
    out += CROCKFORD[crypto.randomInt(0, CROCKFORD.length)];
  }
  return out;
}

/** "SNDT-7QF3K-2M9XA" */
export function newLicenseId(): string {
  return `SNDT-${group5()}-${group5()}`;
}

const LIC_RE = /^SNDT-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
export function isLicenseId(value: string): boolean {
  return LIC_RE.test(value);
}

/** 128-bit random order ref (UUIDv4). */
export function newRef(): string {
  return crypto.randomUUID();
}
