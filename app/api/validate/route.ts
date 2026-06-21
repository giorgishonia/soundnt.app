/**
 * POST /api/validate — launch/heartbeat revocation+expiry check (spec §7).
 * Cheap and forgiving: the app treats any non-200 / network error as "no change".
 */

import { parseBody, json, tooMany, clientIp } from "@/lib/http";
import { validateSchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { validateLicense } from "@/lib/services/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const parsed = await parseBody(req, validateSchema);
  if (!parsed.ok) return parsed.response;

  const rl = await rateLimit(LIMITS.validate, parsed.data.lic);
  if (!rl.success) return tooMany(rl.reset);

  const db = getDb();
  const result = await validateLicense(db, {
    lic: parsed.data.lic,
    deviceId: parsed.data.deviceId ?? null,
  });

  return json(result);
}
