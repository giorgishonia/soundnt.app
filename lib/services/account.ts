/**
 * lib/services/account.ts — account-light, password-free magic links.
 *
 * Magic links are STATELESS (no extra table): a short-lived HMAC-signed token
 * carrying the email. Verifying re-derives the HMAC and checks expiry. The
 * secret is passed in (route supplies env), so this is unit-testable.
 */

import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { activations, licenses } from "@/lib/db/schema";
import type { Activation, License } from "@/lib/db/schema";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

interface AccountClaims {
  email: string;
  exp: number; // unix seconds
}

/** Create a magic-link token for `email`, valid for `ttlSec` (default 15 min). */
export function signAccountToken(email: string, secret: string, ttlSec = 900): string {
  const claims: AccountClaims = {
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  };
  const body = b64url(Buffer.from(JSON.stringify(claims), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify a magic-link token; returns the email or null. Constant-time. */
export function verifyAccountToken(token: string, secret: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccountClaims;
    if (typeof claims.email !== "string" || typeof claims.exp !== "number") return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims.email;
  } catch {
    return null;
  }
}

export interface AccountLicenseView {
  license: License;
  devices: Activation[];
}

export async function accountLicenses(db: Db, email: string): Promise<AccountLicenseView[]> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(licenses)
    .where(eq(licenses.email, normalized))
    .orderBy(desc(licenses.createdAt));

  const views: AccountLicenseView[] = [];
  for (const license of rows) {
    const devices = await db
      .select()
      .from(activations)
      .where(eq(activations.licenseId, license.id))
      .orderBy(desc(activations.lastSeen));
    views.push({ license, devices });
  }
  return views;
}

/**
 * Remove a device binding, freeing a slot — but only if the license belongs to
 * the authenticated email (authz check).
 */
export async function deactivateDevice(
  db: Db,
  input: { email: string; lic: string; deviceId: string }
): Promise<{ ok: boolean }> {
  const normalized = input.email.trim().toLowerCase();
  const lrows = await db
    .select()
    .from(licenses)
    .where(and(eq(licenses.lic, input.lic), eq(licenses.email, normalized)))
    .limit(1);
  const license = lrows[0];
  if (!license) return { ok: false };

  await db
    .delete(activations)
    .where(and(eq(activations.licenseId, license.id), eq(activations.deviceId, input.deviceId)));
  return { ok: true };
}
