/**
 * lib/license.ts — the license token issuer + verifier (spec §2, non-negotiable).
 *
 * Wire format:  token = base64url(JSON(payload)) + "." + base64url(ed25519_sig)
 * The signature is Ed25519 over the ASCII bytes of the FIRST segment string
 * (the base64url(payload) text), JWT-style. Do NOT sign raw JSON.
 *
 * This file is server-only: it imports the signing key. Never import it into a
 * client component. The signing logic is proven against the §2.4 test vector in
 * tests/license.test.ts.
 */

import crypto from "node:crypto";
import { PLANS, type PlanId } from "@/lib/plans";

const b64url = (buf: crypto.BinaryLike): string =>
  Buffer.from(buf as Buffer).toString("base64url");

export interface LicensePayload {
  v: 1;
  lic: string;
  plan: PlanId;
  term_months: number;
  iat: number;
  exp: number;
  email?: string;
}

export type Ed25519PrivateJwk = {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  d: string;
};

export type Ed25519PublicJwk = {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
};

export interface SignedLicense {
  token: string;
  payload: LicensePayload;
}

/**
 * Sign a license token. `iat`/`exp` are derived from PLANS — exp = iat +
 * days*86400 (UTC unix seconds). Email is omitted entirely when absent.
 */
export function signLicense(
  input: { lic: string; plan: PlanId; email?: string | null; iat?: number },
  privateJwk: Ed25519PrivateJwk
): SignedLicense {
  const p = PLANS[input.plan];
  if (!p) throw new Error(`unknown plan: ${input.plan}`);

  const key = crypto.createPrivateKey({ key: privateJwk, format: "jwk" });
  const now = input.iat ?? Math.floor(Date.now() / 1000);

  const payload: LicensePayload = {
    v: 1,
    lic: input.lic,
    plan: input.plan,
    term_months: p.termMonths,
    iat: now,
    exp: now + p.days * 86400,
  };
  if (input.email) payload.email = String(input.email);

  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  // Ed25519 ⇒ algorithm null; sign the base64url STRING bytes, not raw JSON.
  const sig = crypto.sign(null, Buffer.from(payloadB64, "utf8"), key);

  return { token: `${payloadB64}.${b64url(sig)}`, payload };
}

/**
 * Verify a token against an Ed25519 public `x` (base64url). Throws on a bad
 * signature or malformed token. Mirrors exactly what the desktop app does.
 */
export function verifyLicense(
  token: string,
  publicXB64url: string
): LicensePayload {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("malformed token");
  }
  const [p, s] = parts;
  const pub = crypto.createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicXB64url },
    format: "jwk",
  });
  const ok = crypto.verify(
    null,
    Buffer.from(p, "utf8"),
    pub,
    Buffer.from(s, "base64url")
  );
  if (!ok) throw new Error("bad signature");
  return JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as LicensePayload;
}

/** Decode a token WITHOUT verifying (e.g. to read `lic` before key lookup). */
export function decodeUnsafe(token: string): LicensePayload | null {
  try {
    const seg = token.split(".")[0];
    if (!seg) return null;
    return JSON.parse(Buffer.from(seg, "base64url").toString("utf8")) as LicensePayload;
  } catch {
    return null;
  }
}

/** Derive the public `x` (base64url) from a private JWK — used for self-checks. */
export function publicXFromPrivate(privateJwk: Ed25519PrivateJwk): string {
  return privateJwk.x;
}
