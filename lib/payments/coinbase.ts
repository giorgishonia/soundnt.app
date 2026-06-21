/**
 * lib/payments/coinbase.ts — Coinbase Commerce provider.
 *
 * STUB: webhook signature verification implemented; invoice creation throws
 * until wired up. Coinbase sends `X-CC-Webhook-Signature` = HMAC-SHA256 (hex) of
 * the RAW body with the shared secret, and a `charge:confirmed` event when paid.
 */

import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import type {
  CreateInvoiceInput,
  CreateInvoiceResult,
  PaymentProvider,
  VerifyWebhookResult,
} from "@/lib/payments/provider";

function timingSafeHexEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export const coinbase: PaymentProvider = {
  name: "coinbase",

  isConfigured() {
    const c = env.coinbase();
    return Boolean(c.apiKey && c.webhookSecret);
  },

  async createInvoice(_input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    throw new Error("coinbase createInvoice not implemented (stub)");
  },

  async verifyWebhook(req: Request, rawBody: string): Promise<VerifyWebhookResult> {
    const secret = env.coinbase().webhookSecret;
    if (!secret) return { ok: false, reason: "coinbase webhook secret not configured" };

    const header = req.headers.get("x-cc-webhook-signature") ?? "";
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!timingSafeHexEqual(header, expected)) return { ok: false, reason: "bad signature" };

    let payload: { event?: { id?: string; type?: string; data?: { metadata?: Record<string, unknown> } } };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "invalid json" };
    }

    const event = payload.event ?? {};
    const type = String(event.type ?? "");
    const orderRef = String(event.data?.metadata?.orderRef ?? event.data?.metadata?.orderId ?? "");
    const eventId = String(event.id ?? "");
    if (!orderRef || !eventId) return { ok: false, reason: "missing orderRef/eventId" };

    const status =
      type === "charge:confirmed" || type === "charge:resolved"
        ? "paid"
        : type === "charge:failed"
          ? "failed"
          : "pending";

    return { ok: true, eventId: `${eventId}:${type}`, orderRef, status, raw: payload };
  },
};
