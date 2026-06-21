/**
 * POST /api/webhooks/nowpayments — IPN → mint license (spec §5, §6).
 *
 * Reads the RAW body for HMAC verification, then idempotently processes the
 * payment. Returns 200 fast on anything we accept (so the provider stops
 * retrying); only a bad/forged signature gets a 4xx.
 */

import { errorJson, json, tooMany, clientIp } from "@/lib/http";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { getProvider } from "@/lib/payments";
import { processPaymentWebhook } from "@/lib/services/issue";
import { sendLicenseEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { PLANS, type PlanId } from "@/lib/plans";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(LIMITS.webhook, ip);
  if (!rl.success) return tooMany(rl.reset);

  const rawBody = await req.text();
  const provider = getProvider("nowpayments");

  const verified = await provider.verifyWebhook(req, rawBody);
  if (!verified.ok) {
    log.warn("nowpayments webhook rejected", { reason: verified.reason });
    return errorJson("invalid webhook", 400);
  }

  let signingKey;
  try {
    signingKey = env.signingKey();
  } catch (e) {
    log.error("signing key unavailable for webhook", { err: String(e) });
    return errorJson("server not configured", 500);
  }

  const db = getDb();
  const result = await processPaymentWebhook(db, {
    provider: "nowpayments",
    eventId: verified.eventId,
    orderRef: verified.orderRef,
    status: verified.status,
    priceAmountUsd: verified.priceAmountUsd,
    actuallyPaid: verified.actuallyPaid,
    payAmount: verified.payAmount,
    payload: verified.raw,
    signingKey,
  });

  // Deliver the email only on the first mint, and only if we have an address.
  if (result.outcome === "minted" && result.license?.email) {
    const lic = result.license;
    await sendLicenseEmail({
      to: lic.email!,
      lic: lic.lic,
      token: lic.token,
      plan: lic.plan as PlanId,
      exp: lic.exp,
      amountCents: PLANS[lic.plan as PlanId]?.amountCents ?? 0,
      orderRef: lic.orderRef ?? verified.orderRef,
    });
  }

  return json({ ok: true, outcome: result.outcome });
}
