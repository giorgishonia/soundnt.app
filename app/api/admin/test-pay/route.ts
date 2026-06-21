/**
 * POST /api/admin/test-pay — TEST_MODE: mark a pending order paid and mint a
 * license WITHOUT a real payment (spec §14, manual acceptance #1).
 * Gated by both ADMIN_TOKEN and ALLOW_TEST_MODE=true. Never enable in prod.
 */

import { parseBody, json, errorJson, tooMany, requireAdmin, clientIp } from "@/lib/http";
import { testPaySchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { markOrderPaidTestMode } from "@/lib/services/issue";
import { sendLicenseEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { PLANS, type PlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const rl = await rateLimit(LIMITS.admin, clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

  if (!env.allowTestMode()) return errorJson("test mode disabled", 403);

  const parsed = await parseBody(req, testPaySchema);
  if (!parsed.ok) return parsed.response;

  let signingKey;
  try {
    signingKey = env.signingKey();
  } catch {
    return errorJson("signing key not configured", 500);
  }

  const db = getDb();
  const result = await markOrderPaidTestMode(db, parsed.data.ref, signingKey);
  if (result.outcome === "no_order") return errorJson("order not found", 404);
  if (result.outcome === "expired") return errorJson("order has expired", 410);

  if (result.outcome === "minted" && result.license?.email) {
    const lic = result.license;
    await sendLicenseEmail({
      to: lic.email!,
      lic: lic.lic,
      token: lic.token,
      plan: lic.plan as PlanId,
      exp: lic.exp,
      amountCents: PLANS[lic.plan as PlanId]?.amountCents ?? 0,
      orderRef: lic.orderRef ?? parsed.data.ref,
    });
  }

  return json({
    ok: true,
    outcome: result.outcome,
    lic: result.license?.lic,
    token: result.license?.token,
  });
}
