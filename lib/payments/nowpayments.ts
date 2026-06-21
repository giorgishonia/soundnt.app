/**
 * lib/payments/nowpayments.ts — NOWPayments provider (spec §5, primary).
 *
 * Hosted invoices + IPN webhook, 300+ coins, no buyer KYC. Invoice amount and
 * order_id are set here from server-derived values; the buyer picks a coin on
 * the hosted page.
 */

import "server-only";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import type {
  CreateInvoiceInput,
  CreateInvoiceResult,
  PaymentProvider,
  VerifyWebhookResult,
  WebhookStatus,
} from "@/lib/payments/provider";
import { verifyNowpaymentsSignature } from "@/lib/payments/nowpayments-sig";

const API = "https://api.nowpayments.io/v1";

function mapStatus(paymentStatus: string): WebhookStatus {
  switch (paymentStatus) {
    case "finished":
    case "confirmed":
      return "paid";
    case "partially_paid":
    case "waiting":
    case "confirming":
    case "sending":
      return "pending";
    case "failed":
    case "expired":
    case "refunded":
      return "failed";
    default:
      return "pending";
  }
}

export const nowpayments: PaymentProvider = {
  name: "nowpayments",

  isConfigured() {
    return Boolean(env.nowpaymentsApiKey() && env.nowpaymentsIpnSecret());
  },

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const apiKey = env.nowpaymentsApiKey();
    if (!apiKey) throw new Error("NOWPAYMENTS_API_KEY not configured");

    const res = await fetch(`${API}/invoice`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        price_amount: input.amountUsd,
        price_currency: "usd",
        order_id: input.orderRef,
        order_description: `soundn't Pro — ${input.plan}`,
        ipn_callback_url: input.ipnCallbackUrl,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        is_fee_paid_by_user: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log.error("nowpayments createInvoice failed", { status: res.status, body: text.slice(0, 300) });
      throw new Error(`nowpayments invoice failed (${res.status})`);
    }

    const data = (await res.json()) as { id?: string | number; invoice_url?: string };
    if (!data.invoice_url || data.id == null) {
      throw new Error("nowpayments invoice response missing id/invoice_url");
    }
    return { invoiceId: String(data.id), invoiceUrl: data.invoice_url };
  },

  async verifyWebhook(req: Request, rawBody: string): Promise<VerifyWebhookResult> {
    const secret = env.nowpaymentsIpnSecret();
    if (!secret) return { ok: false, reason: "ipn secret not configured" };

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "invalid json" };
    }

    const sig = req.headers.get("x-nowpayments-sig");
    if (!verifyNowpaymentsSignature(payload, sig, secret)) {
      return { ok: false, reason: "bad signature" };
    }

    const orderRef = typeof payload.order_id === "string" ? payload.order_id : "";
    const paymentStatus = String(payload.payment_status ?? "");
    if (!orderRef || !paymentStatus) {
      return { ok: false, reason: "missing order_id or payment_status" };
    }

    const idBase = String(payload.payment_id ?? payload.invoice_id ?? orderRef);
    const priceAmount = Number(payload.price_amount);
    const actuallyPaid = Number(payload.actually_paid);
    const payAmount = Number(payload.pay_amount);

    return {
      ok: true,
      eventId: `${idBase}:${paymentStatus}`,
      orderRef,
      status: mapStatus(paymentStatus),
      priceAmountUsd: Number.isFinite(priceAmount) ? priceAmount : undefined,
      actuallyPaid: Number.isFinite(actuallyPaid) ? actuallyPaid : undefined,
      payAmount: Number.isFinite(payAmount) ? payAmount : undefined,
      raw: payload,
    };
  },
};
