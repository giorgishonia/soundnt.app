/**
 * lib/payments/provider.ts — the PaymentProvider abstraction (spec §5).
 *
 * NOWPayments is primary; BTCPay + Coinbase Commerce implement the same
 * interface (stubs for now). The route layer talks only to this interface.
 */

import type { PlanId } from "@/lib/plans";

export type ProviderName = "nowpayments" | "btcpay" | "coinbase" | "demo";

export type WebhookStatus = "paid" | "pending" | "failed";

export interface CreateInvoiceInput {
  orderRef: string;
  plan: PlanId;
  amountUsd: number; // dollars, server-derived
  successUrl: string;
  cancelUrl: string;
  ipnCallbackUrl: string;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceUrl: string;
}

export type VerifyWebhookResult =
  | { ok: false; reason: string }
  | {
      ok: true;
      /** Idempotency key — unique per (status transition of a) payment. */
      eventId: string;
      orderRef: string;
      status: WebhookStatus;
      /** USD price the invoice was created for (sanity-check vs the order). */
      priceAmountUsd?: number;
      /** Crypto actually received vs required — used to reject underpayments. */
      actuallyPaid?: number;
      payAmount?: number;
      raw: unknown;
    };

export interface PaymentProvider {
  readonly name: ProviderName;
  /** True when the env credentials needed to operate are present. */
  isConfigured(): boolean;
  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;
  verifyWebhook(req: Request, rawBody: string): Promise<VerifyWebhookResult>;
}
