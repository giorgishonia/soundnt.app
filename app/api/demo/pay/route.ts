/**
 * POST /api/demo/pay — DEMO ONLY: simulate a confirmed crypto payment.
 *
 * Marks a pending order paid and mints a real Ed25519-signed license WITHOUT any
 * crypto changing hands. This is the self-serve counterpart to the admin-only
 * /api/admin/test-pay: it needs NO admin token, but is hard-gated behind
 * DEMO_MODE=true so it can only ever exist on a demo deployment.
 *
 * ⚠️ If DEMO_MODE is off, this endpoint returns 404 as if it didn't exist.
 */

import { parseBody, json, errorJson, tooMany, clientIp } from "@/lib/http";
import { testPaySchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { markOrderPaidTestMode } from "@/lib/services/issue";
import { sendLicenseEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { PLANS, type PlanId } from "@/lib/plans";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Pretend it doesn't exist unless this is an explicit demo deployment.
  if (!env.demoMode()) return errorJson("not found", 404);

  const rl = await rateLimit(LIMITS.checkout, clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

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
  if (result.outcome === "expired")
    return errorJson("this demo order has expired — start a new checkout", 410);

  log.info("demo payment simulated", { ref: parsed.data.ref, outcome: result.outcome });

  // Best-effort license email (no-op when Resend isn't configured).
  if (result.license?.email) {
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
