/**
 * POST /api/account/request — issue a magic link to view licenses (spec §7, §10).
 * Always 200 {ok:true}. Only sends a link when the email actually has licenses.
 */

import { parseBody, json, tooMany, clientIp } from "@/lib/http";
import { accountRequestSchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { activeLicensesByEmail } from "@/lib/services/recover";
import { signAccountToken } from "@/lib/services/account";
import { sendMagicLinkEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);

  const parsed = await parseBody(req, accountRequestSchema);
  if (!parsed.ok) return parsed.response;

  const rl = await rateLimit(LIMITS.account, `${ip}:${parsed.data.email}`);
  if (!rl.success) return tooMany(rl.reset);

  const secret = env.accountLinkSecret();
  if (!secret) {
    log.warn("account magic link disabled: no ACCOUNT_LINK_SECRET/ADMIN_TOKEN");
    return json({ ok: true });
  }

  const db = getDb();
  const licenses = await activeLicensesByEmail(db, parsed.data.email);
  if (licenses.length > 0) {
    const token = signAccountToken(parsed.data.email, secret);
    const url = `${env.appBaseUrl()}/account?token=${encodeURIComponent(token)}`;
    await sendMagicLinkEmail(parsed.data.email, url);
  }

  return json({ ok: true });
}
