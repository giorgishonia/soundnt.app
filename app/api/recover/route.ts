/**
 * POST /api/recover — email a buyer their license(s) (spec §7).
 * Always returns 200 {ok:true} so it never leaks which emails exist.
 */

import { parseBody, json, tooMany, clientIp } from "@/lib/http";
import { recoverSchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { activeLicensesByEmail } from "@/lib/services/recover";
import { sendRecoveryEmail } from "@/lib/email";
import type { PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);

  const parsed = await parseBody(req, recoverSchema);
  if (!parsed.ok) return parsed.response;

  const rl = await rateLimit(LIMITS.recover, `${ip}:${parsed.data.email}`);
  if (!rl.success) return tooMany(rl.reset);

  const db = getDb();
  const licenses = await activeLicensesByEmail(db, parsed.data.email);

  if (licenses.length > 0) {
    await sendRecoveryEmail({
      to: parsed.data.email,
      licenses: licenses.map((l) => ({
        lic: l.lic,
        token: l.token,
        plan: l.plan as PlanId,
        exp: l.exp,
      })),
    });
  }

  return json({ ok: true });
}
