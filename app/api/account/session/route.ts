/**
 * GET /api/account/session?token=… — exchange a magic-link token for the
 * caller's licenses + devices (spec §10). The token authenticates the email.
 */

import { json, errorJson, tooMany, clientIp } from "@/lib/http";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { verifyAccountToken, accountLicenses } from "@/lib/services/account";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(LIMITS.account, ip);
  if (!rl.success) return tooMany(rl.reset);

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const secret = env.accountLinkSecret();
  if (!secret) return errorJson("account sign-in unavailable", 503);

  const email = verifyAccountToken(token, secret);
  if (!email) return errorJson("invalid or expired link", 401);

  const db = getDb();
  const views = await accountLicenses(db, email);

  return json({
    ok: true,
    email,
    devicesMax: env.maxDevices(),
    licenses: views.map((v) => ({
      lic: v.license.lic,
      plan: v.license.plan,
      exp: v.license.exp,
      status: v.license.status,
      token: v.license.token,
      devices: v.devices.map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        appVersion: d.appVersion,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
      })),
    })),
  });
}
