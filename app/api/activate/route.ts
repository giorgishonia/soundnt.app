/**
 * POST /api/activate — register a device after the app activates a token (spec §7).
 * Verifies the signature server-side, enforces MAX_DEVICES, honors revocation.
 */

import { parseBody, json, tooMany, clientIp } from "@/lib/http";
import { activateSchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { registerActivation } from "@/lib/services/activations";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);

  const parsed = await parseBody(req, activateSchema);
  if (!parsed.ok) return parsed.response;

  const rl = await rateLimit(LIMITS.activate, `${ip}:${parsed.data.deviceId}`);
  if (!rl.success) return tooMany(rl.reset);

  const db = getDb();
  const result = await registerActivation(db, {
    token: parsed.data.token,
    deviceId: parsed.data.deviceId,
    deviceName: parsed.data.deviceName ?? null,
    appVersion: parsed.data.appVersion ?? null,
    ip,
    publicX: env.signingPublicX(),
    maxDevices: env.maxDevices(),
  });

  return json(result);
}
