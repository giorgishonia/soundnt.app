"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bitcoin,
  Loader2,
  ShieldCheck,
  AlertCircle,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";

const SUPPORTED_COINS = ["BTC", "ETH", "USDT", "LTC", "SOL", "XMR"];

function isValidPlan(value: string | null): value is PlanId {
  return value != null && (PLAN_ORDER as string[]).includes(value);
}

export function DemoPayClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const ref = sp.get("ref");
  const planParam = sp.get("plan");
  const plan = isValidPlan(planParam) ? planParam : null;
  const planDef = plan ? PLANS[plan] : null;
  const price = planDef ? (planDef.amountCents / 100).toFixed(2) : null;

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handlePay() {
    if (loading || !ref) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ref }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not complete the demo payment.");
        setLoading(false);
        return;
      }
      // Minted — hand off to the success page, which polls and shows the key.
      // (The desktop app is also polling and will unlock on its own.)
      router.push(`/buy/success?ref=${encodeURIComponent(ref)}`);
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  }

  if (!ref || !planDef) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-fg">
          Missing checkout details
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          This demo checkout link is missing its order reference or plan. Start
          over from the pricing page.
        </p>
        <div className="mt-6">
          <Button asChild>
            <Link href="/buy">Back to checkout</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-6">
        <Badge variant="muted" className="mb-3">
          <FlaskConical className="mr-1.5 h-3.5 w-3.5 text-teal" /> Demo checkout
        </Badge>
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          Pay with crypto
        </h1>
      </div>

      {/* Demo notice */}
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-teal/25 bg-teal/[0.06] px-4 py-3 text-sm text-fg">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
        <span>
          <strong>This is a demo.</strong> No real payment is taken and no crypto
          is sent. Clicking the button below simulates a confirmed payment and
          mints a real, signed license so you can see the app unlock.
        </span>
      </div>

      <div className="glass relative overflow-hidden rounded-2xl">
        <div className="glow-teal pointer-events-none absolute inset-x-0 top-0 h-32" />

        {/* Summary */}
        <div className="relative flex items-baseline justify-between gap-4 border-b border-[rgba(58,43,36,0.08)] p-5">
          <div>
            <div className="text-sm font-medium text-muted">soundn&apos;t Pro</div>
            <div className="mt-0.5 text-lg font-semibold text-fg">
              {planDef.term}
              {planDef.highlight ? (
                <Badge className="ml-2 align-middle">Best value</Badge>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <div className="tnum text-3xl font-bold tracking-tight text-fg">
              ${price}
            </div>
            <div className="text-xs text-faint">USD · one-time</div>
          </div>
        </div>

        {/* Mock invoice body */}
        <div className="relative space-y-4 p-5">
          <div className="flex items-start gap-3">
            <Bitcoin className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
            <div>
              <div className="text-sm font-semibold text-fg">Choose a coin</div>
              <p className="tnum mt-1 text-xs text-faint">
                {SUPPORTED_COINS.join(", ")} and 300+ more
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-[rgba(58,43,36,0.12)] bg-[rgba(58,43,36,0.03)] p-4">
            <div className="text-xs font-medium text-muted">
              Send exactly (demo)
            </div>
            <div className="tnum mt-1 break-all font-mono text-sm text-fg">
              0.000000 BTC
            </div>
            <div className="mt-3 text-xs font-medium text-muted">
              To address (demo)
            </div>
            <div className="tnum mt-1 break-all font-mono text-xs text-faint">
              bc1qdemo0soundnt0demo0address0not0real0do0not0send
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/25 bg-danger/10 px-3 py-2.5 text-sm text-danger"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={handlePay}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Confirming payment…
              </>
            ) : (
              <>
                Simulate payment &amp; unlock <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-faint">
            <ShieldCheck className="h-3.5 w-3.5 text-teal" />
            Mints a genuine Ed25519-signed license — the same one the app verifies
            offline.
          </p>
        </div>
      </div>

      <div className="mt-4 text-center">
        <Link
          href={`/buy?plan=${plan}`}
          className="text-xs text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Cancel
        </Link>
      </div>
    </section>
  );
}
