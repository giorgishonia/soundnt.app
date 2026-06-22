/**
 * POST /api/checkout — create an order + payment invoice (spec §7).
 * Amount/term are derived server-side from the plan; client price is ignored.
 */

import { parseBody, errorJson, json, tooMany, clientIp } from "@/lib/http";
import { checkoutSchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb, type Db } from "@/lib/db/client";
import { createOrderIfAbsent, attachInvoice, findOrderByRef } from "@/lib/services/orders";
import type { Order } from "@/lib/db/schema";
import { PLANS, amountUsd, amountUsdNumber, type PlanId } from "@/lib/plans";
import { env } from "@/lib/env";
import { getActiveProvider } from "@/lib/payments";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function epoch(d: Date | null): number | null {
  return d ? Math.floor(d.getTime() / 1000) : null;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(LIMITS.checkout, ip);
  if (!rl.success) return tooMany(rl.reset);

  const parsed = await parseBody(req, checkoutSchema);
  if (!parsed.ok) return parsed.response;

  const plan = parsed.data.plan as PlanId;
  const { ref, device, email, appVersion } = parsed.data;
  const planDef = PLANS[plan];

  const provider = getActiveProvider();

  // Fail loud-but-clean if the backend isn't configured (missing DATABASE_URL or
  // payment-provider keys) rather than throwing an opaque 500. This is what the
  // browser hits when the Vercel env vars aren't set — see /api/health.
  if (!provider.isConfigured()) {
    log.error("checkout blocked: payment provider not configured", { provider: provider.name });
    return errorJson("payments are not configured yet — please try again later", 503);
  }

  const base = env.appBaseUrl();
  const ttl = env.pendingOrderTtlSeconds();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  let db: Db;
  try {
    db = getDb();
  } catch (e) {
    log.error("checkout blocked: database not configured", { err: String(e) });
    return errorJson("service temporarily unavailable", 503);
  }

  // Create (or fetch) the order — idempotent on ref.
  let order: Order;
  let created: boolean;
  try {
    ({ order, created } = await createOrderIfAbsent(db, {
      ref,
      plan,
      amountCents: planDef.amountCents,
      provider: provider.name,
      deviceId: device ?? null,
      email: email ?? null,
      appVersion: appVersion ?? null,
      expiresAt,
    }));
  } catch (e) {
    log.error("checkout blocked: order persistence failed", { ref, err: String(e) });
    return errorJson("service temporarily unavailable", 503);
  }

  // A reused ref with a different plan is a conflict (capability collision).
  if (!created && order.plan !== plan) {
    return errorJson("order ref already used for a different plan", 409);
  }

  // Already paid ⇒ point the caller at the order endpoint (no new invoice).
  if (order.status === "paid") {
    return json({
      orderRef: ref,
      invoiceUrl: order.providerInvoiceUrl ?? null,
      amount: amountUsd(plan),
      currency: "USD",
      plan,
      expiresAt: epoch(order.expiresAt),
      alreadyPaid: true,
    });
  }

  // Idempotent re-checkout: return the existing invoice rather than minting a new one.
  if (order.providerInvoiceUrl) {
    return json({
      orderRef: ref,
      invoiceUrl: order.providerInvoiceUrl,
      amount: amountUsd(plan),
      currency: "USD",
      plan,
      expiresAt: epoch(order.expiresAt),
    });
  }

  // Create a fresh invoice with the payment provider.
  try {
    const invoice = await provider.createInvoice({
      orderRef: ref,
      plan,
      amountUsd: amountUsdNumber(plan),
      successUrl: `${base}/buy/success?ref=${encodeURIComponent(ref)}`,
      cancelUrl: `${base}/buy?plan=${plan}&ref=${encodeURIComponent(ref)}`,
      ipnCallbackUrl: `${base}/api/webhooks/${provider.name}`,
    });
    await attachInvoice(db, ref, provider.name, invoice.invoiceId, invoice.invoiceUrl);
    log.info("checkout invoice created", { ref, plan, provider: provider.name });

    return json({
      orderRef: ref,
      invoiceUrl: invoice.invoiceUrl,
      amount: amountUsd(plan),
      currency: "USD",
      plan,
      expiresAt: epoch(expiresAt),
    });
  } catch (e) {
    log.error("checkout invoice failed", { ref, plan, err: String(e) });
    return errorJson("could not create payment invoice", 502);
  }
}
