/**
 * lib/services/validate.ts — revocation/expiry truth (spec §7 POST /api/validate).
 *
 * Cheap and forgiving: the app treats a network failure as "no change" and the
 * embedded-signature check is the source of truth for normal expiry. This just
 * lets the operator force a lock via revocation, and bumps the heartbeat.
 */

import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { activations, licenses } from "@/lib/db/schema";

export type ValidateStatus = "active" | "expired" | "revoked" | "unknown";

export interface ValidateResult {
  status: ValidateStatus;
  exp?: number;
}

export async function validateLicense(
  db: Db,
  input: { lic: string; deviceId?: string | null }
): Promise<ValidateResult> {
  const rows = await db.select().from(licenses).where(eq(licenses.lic, input.lic)).limit(1);
  const license = rows[0];
  if (!license) return { status: "unknown" };

  // Heartbeat: bump last_seen for this device's activation if it exists.
  if (input.deviceId) {
    await db
      .update(activations)
      .set({ lastSeen: new Date() })
      .where(and(eq(activations.licenseId, license.id), eq(activations.deviceId, input.deviceId)));
  }

  if (license.status === "revoked" || license.status === "refunded") {
    return { status: "revoked", exp: license.exp };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (license.exp < nowSec) {
    return { status: "expired", exp: license.exp };
  }

  return { status: "active", exp: license.exp };
}
