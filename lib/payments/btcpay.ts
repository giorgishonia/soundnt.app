/**
 * lib/payments/btcpay.ts — BTCPay Server provider (self-hosted, 0-fee).
 *
 * STUB: webhook signature verification is implemented (the security-critical
 * part); invoice creation throws until a store is wired up. BTCPay sends
 * `BTCPay-Sig: sha256=<hex>` = HMAC-SHA256 of the RAW body with the webhook
 * secret, and an `InvoiceSettled` event when paid.
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

export const btcpay: PaymentProvider = {
  name: "btcpay",

  isConfigured() {
    const c = env.btcpay();
    return Boolean(c.host && c.apiKey && c.storeId && c.webhookSecret);
  },

  async createInvoice(_input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    throw new Error("btcpay createInvoice not implemented (stub)");
  },

  async verifyWebhook(req: Request, rawBody: string): Promise<VerifyWebhookResult> {
    const secret = env.btcpay().webhookSecret;
    if (!secret) return { ok: false, reason: "btcpay webhook secret not configured" };

    const header = req.headers.get("btcpay-sig") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    if (!timingSafeHexEqual(header, expected)) return { ok: false, reason: "bad signature" };

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "invalid json" };
    }

    const type = String(payload.type ?? "");
    const metadata = (payload.metadata as Record<string, unknown> | undefined) ?? {};
    const orderRef = String(metadata.orderId ?? metadata.orderRef ?? "");
    const eventId = String(payload.deliveryId ?? payload.invoiceId ?? "");
    if (!orderRef || !eventId) return { ok: false, reason: "missing orderRef/eventId" };

    const status =
      type === "InvoiceSettled" || type === "InvoicePaymentSettled"
        ? "paid"
        : type === "InvoiceInvalid" || type === "InvoiceExpired"
          ? "failed"
          : "pending";

    return { ok: true, eventId: `${eventId}:${type}`, orderRef, status, raw: payload };
  },
};
