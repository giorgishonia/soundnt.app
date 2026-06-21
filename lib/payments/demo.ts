/**
 * lib/payments/demo.ts — the DEMO payment provider (no real crypto).
 *
 * Enabled by DEMO_MODE=true. Instead of creating a real hosted crypto invoice,
 * it points the buyer at an internal "demo checkout" page (`/buy/demo-pay`) that
 * lets them simulate a payment with a click. That page calls `POST /api/demo/pay`,
 * which mints a genuine Ed25519-signed license (the same one the desktop app
 * verifies offline) — so the whole app↔site flow works end-to-end WITHOUT anyone
 * spending crypto.
 *
 * ⚠️ This bypasses payment entirely. NEVER enable DEMO_MODE on a real store.
 */

import "server-only";
import { env } from "@/lib/env";
import type {
  CreateInvoiceInput,
  CreateInvoiceResult,
  PaymentProvider,
  VerifyWebhookResult,
} from "@/lib/payments/provider";

export const demo: PaymentProvider = {
  name: "demo",

  isConfigured() {
    return env.demoMode();
  },

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    // The "invoice" is just our internal demo checkout page. It carries the order
    // ref + plan so the page can render the right amount and mint on confirm.
    const base = env.appBaseUrl().replace(/\/+$/, "");
    const url = new URL(`${base}/buy/demo-pay`);
    url.searchParams.set("ref", input.orderRef);
    url.searchParams.set("plan", input.plan);
    return {
      invoiceId: `demo-${input.orderRef}`,
      invoiceUrl: url.toString(),
    };
  },

  // No real IPN in demo mode — the demo-pay endpoint mints directly. If a stray
  // request ever reaches a webhook for this provider, reject it.
  async verifyWebhook(): Promise<VerifyWebhookResult> {
    return { ok: false, reason: "demo provider has no webhook" };
  },
};
