/**
 * lib/payments/index.ts — provider registry.
 *
 * NOWPayments is the default/primary. `getProvider` returns the named provider
 * (or the primary). `getActiveProvider` returns the first configured one — used
 * by checkout so the site degrades gracefully if only one is set up.
 */

import "server-only";
import type { PaymentProvider, ProviderName } from "@/lib/payments/provider";
import { nowpayments } from "@/lib/payments/nowpayments";
import { btcpay } from "@/lib/payments/btcpay";
import { coinbase } from "@/lib/payments/coinbase";
import { demo } from "@/lib/payments/demo";

export const PROVIDERS: Record<ProviderName, PaymentProvider> = {
  nowpayments,
  btcpay,
  coinbase,
  demo,
};

export const PRIMARY: ProviderName = "nowpayments";

export function getProvider(name: ProviderName = PRIMARY): PaymentProvider {
  return PROVIDERS[name];
}

/**
 * First configured provider. DEMO_MODE wins outright (so a demo deploy needs no
 * real provider keys); otherwise prefer the primary, then the alternates.
 */
export function getActiveProvider(): PaymentProvider {
  const order: ProviderName[] = ["demo", PRIMARY, "btcpay", "coinbase"];
  for (const n of order) {
    if (PROVIDERS[n].isConfigured()) return PROVIDERS[n];
  }
  return PROVIDERS[PRIMARY]; // fall back to primary even if unconfigured (clear error on use)
}

export type { PaymentProvider, ProviderName };
