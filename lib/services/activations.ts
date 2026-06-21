/**
 * lib/services/activations.ts — device registration + MAX_DEVICES enforcement
 * (spec §7 POST /api/activate).
 *
 * The token signature is verified server-side with the public key; the license
 * is loaded by `lic`. Device count is enforced race-safely by inserting then
 * counting, and rolling back the insert if it would exceed the cap.
 */

import { and, count, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { activations, licenses } from "@/lib/db/schema";
import { verifyLicense } from "@/lib/license";

export type ActivateResult =
  | { ok: true; status: "active"; plan: string; exp: number; devicesUsed: number; devicesMax: number }
  | { ok: false; status: "device_limit"; devicesUsed: number; devicesMax: number }
  | { ok: false; status: "revoked" | "expired" | "unknown" | "invalid" };

export interface ActivateInput {
  token: string;
  deviceId: string;
  deviceName?: string | null;
  appVersion?: string | null;
  ip?: string | null;
  publicX: string;
  maxDevices: number;
}

async function distinctDeviceCount(db: Db, licenseId: string): Promise<number> {
  // unique(license_id, device_id) ⇒ row count == distinct device count.
  const r = await db
    .select({ c: count() })
    .from(activations)
    .where(eq(activations.licenseId, licenseId));
  return Number(r[0]?.c ?? 0);
}

export async function registerActivation(db: Db, input: ActivateInput): Promise<ActivateResult> {
  // 1. Verify signature.
  let payload;
  try {
    payload = verifyLicense(input.token, input.publicX);
  } catch {
    return { ok: false, status: "invalid" };
  }

  // 2. Load license by lic.
  const lrows = await db.select().from(licenses).where(eq(licenses.lic, payload.lic)).limit(1);
  const license = lrows[0];
  if (!license) return { ok: false, status: "unknown" };

  if (license.status === "revoked" || license.status === "refunded") {
    return { ok: false, status: "revoked" };
  }

  const now = new Date();

  // 3. Upsert the device binding.
  const existing = await db
    .select()
    .from(activations)
    .where(and(eq(activations.licenseId, license.id), eq(activations.deviceId, input.deviceId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(activations)
      .set({
        lastSeen: now,
        count: existing[0].count + 1,
        deviceName: input.deviceName ?? existing[0].deviceName,
        appVersion: input.appVersion ?? existing[0].appVersion,
        ip: input.ip ?? existing[0].ip,
      })
      .where(eq(activations.id, existing[0].id));

    const used = await distinctDeviceCount(db, license.id);
    return { ok: true, status: "active", plan: license.plan, exp: license.exp, devicesUsed: used, devicesMax: input.maxDevices };
  }

  // New device — insert, then count; roll back if over the cap.
  const inserted = await db
    .insert(activations)
    .values({
      licenseId: license.id,
      deviceId: input.deviceId,
      deviceName: input.deviceName ?? null,
      appVersion: input.appVersion ?? null,
      ip: input.ip ?? null,
      firstSeen: now,
      lastSeen: now,
      count: 1,
    })
    .onConflictDoNothing({ target: [activations.licenseId, activations.deviceId] })
    .returning({ id: activations.id });

  if (!inserted[0]) {
    // Raced with a concurrent insert of the same device — treat as existing.
    const used = await distinctDeviceCount(db, license.id);
    return { ok: true, status: "active", plan: license.plan, exp: license.exp, devicesUsed: used, devicesMax: input.maxDevices };
  }

  const used = await distinctDeviceCount(db, license.id);
  if (used > input.maxDevices) {
    await db.delete(activations).where(eq(activations.id, inserted[0].id));
    return { ok: false, status: "device_limit", devicesUsed: input.maxDevices, devicesMax: input.maxDevices };
  }

  return { ok: true, status: "active", plan: license.plan, exp: license.exp, devicesUsed: used, devicesMax: input.maxDevices };
}
