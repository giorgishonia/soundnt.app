/**
 * POST /api/account/deactivate — remove a device binding, freeing a slot
 * (spec §10). Authorized by the magic-link token; only affects the caller's own
 * licenses.
 */

import { parseBody, json, errorJson, tooMany, clientIp } from "@/lib/http";
import { accountDeactivateSchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { verifyAccountToken, deactivateDevice } from "@/lib/services/account";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(LIMITS.account, ip);
  if (!rl.success) return tooMany(rl.reset);

  const parsed = await parseBody(req, accountDeactivateSchema);
  if (!parsed.ok) return parsed.response;

  const secret = env.accountLinkSecret();
  if (!secret) return errorJson("account sign-in unavailable", 503);

  const email = verifyAccountToken(parsed.data.token, secret);
  if (!email) return errorJson("invalid or expired link", 401);

  const db = getDb();
  const result = await deactivateDevice(db, {
    email,
    lic: parsed.data.lic,
    deviceId: parsed.data.deviceId,
  });

  if (!result.ok) return errorJson("not found", 404);
  return json({ ok: true });
}
