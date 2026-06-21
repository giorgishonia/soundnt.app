"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Bitcoin,
  Check,
  Loader2,
  Lock,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PLAN_ORDER, PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Coins shown as a reassurance line on the summary card. */
const SUPPORTED_COINS = ["BTC", "ETH", "USDT", "LTC", "SOL", "XMR"];

/** Build a query string carrying forward the optional context params. */
function carryParams(
  base: Record<string, string>,
  ref: string | null,
  device: string | null,
  v: string | null
): string {
  const params = new URLSearchParams(base);
  if (ref) params.set("ref", ref);
  if (device) params.set("device", device);
  if (v) params.set("v", v);
  return params.toString();
}

function isValidPlan(value: string | null): value is PlanId {
  return value != null && (PLAN_ORDER as string[]).includes(value);
}

/**
 * Normalize an email the way the server expects it. Strips any character outside
 * visible ASCII (0x21-0x7E) — this removes the zero-width spaces, BOMs and
 * non-breaking spaces that pasted addresses and autofill leave behind and that a
 * plain trim() does not. Without it, a visually-correct address can fail server
 * validation as "Invalid email". (Emails here are ASCII; the server rejects
 * non-ASCII domains too.)
 */
function normalizeEmail(raw: string): string {
  return raw.replace(/[^!-~]/g, "").toLowerCase();
}

/** Lightweight email shape check, mirroring the server's acceptance for UX. */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function BuyClient() {
  const sp = useSearchParams();

  const planParam = sp.get("plan");
  const refParam = sp.get("ref");
  const deviceParam = sp.get("device");
  const versionParam = sp.get("v");

  if (!isValidPlan(planParam)) {
    return (
      <PlanPicker ref_={refParam} device={deviceParam} v={versionParam} />
    );
  }

  return (
    <Checkout
      plan={planParam}
      refParam={refParam}
      device={deviceParam}
      v={versionParam}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Plan picker                                                         */
/* ------------------------------------------------------------------ */

function PlanPicker({
  ref_,
  device,
  v,
}: {
  ref_: string | null;
  device: string | null;
  v: string | null;
}) {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16">
      <div className="mb-8 text-center">
        <Badge variant="muted" className="mb-4">
          <Lock className="mr-1.5 h-3.5 w-3.5 text-teal" /> Step 1 of 2
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          Choose your Pro term
        </h1>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
          Prepaid — longer terms are cheaper per month. No auto-charge, ever.
          You pay once and unlock Pro after your trial.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const price = (plan.amountCents / 100).toFixed(2);
          const query = carryParams({ plan: id }, ref_, device, v);
          return (
            <div
              key={id}
              className={cn(
                "relative flex flex-col rounded-xl p-5 transition-all duration-300",
                plan.highlight ? "glass glass-teal" : "glass hover:-translate-y-0.5 hover:border-[rgba(58,43,36,0.2)]"
              )}
            >
              {plan.highlight ? (
                <Badge className="absolute -top-2.5 left-5">Best value</Badge>
              ) : null}

              <div className="text-sm font-medium text-muted">{plan.term}</div>

              <div className="mt-2 flex items-baseline gap-1">
                <span className="tnum text-3xl font-bold tracking-tight text-fg">
                  ${price}
                </span>
              </div>
              <div className="tnum mt-1 text-sm text-faint">
                {plan.perMonth}
                {plan.save ? (
                  <span className="ml-2 text-teal">save {plan.save}</span>
                ) : null}
              </div>

              <ul className="mt-4 space-y-1.5 text-sm text-muted">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-teal" /> {plan.termMonths * 30}+
                  days of Pro
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-teal" /> Up to 3 devices
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-teal" /> Pay in 300+ coins
                </li>
              </ul>

              <Link
                href={`/buy?${query}`}
                className={cn(
                  "group/btn mt-5 inline-flex h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-all duration-200",
                  plan.highlight
                    ? "bg-teal text-teal-fg shadow-lg shadow-teal/25 hover:bg-teal/90 hover:shadow-teal/40"
                    : "border border-[rgba(58,43,36,0.14)] bg-[rgba(58,43,36,0.04)] text-fg hover:border-teal/40 hover:bg-teal/10 hover:text-teal"
                )}
              >
                Choose {plan.term} <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-0.5" />
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-faint">
        <Bitcoin className="h-3.5 w-3.5 text-teal" />
        {SUPPORTED_COINS.join(", ")} and 300+ more · powered by NOWPayments
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Checkout summary                                                    */
/* ------------------------------------------------------------------ */

interface CheckoutResponse {
  invoiceUrl?: string | null;
  alreadyPaid?: boolean;
  error?: string;
}

function Checkout({
  plan,
  refParam,
  device,
  v,
}: {
  plan: PlanId;
  refParam: string | null;
  device: string | null;
  v: string | null;
}) {
  const router = useRouter();
  const planDef = PLANS[plan];
  const price = (planDef.amountCents / 100).toFixed(2);

  // The order ref. Use the URL ref if present; otherwise mint one on mount so
  // web-initiated buys (no app handoff) still have a stable capability.
  const [ref, setRef] = React.useState<string | null>(refParam);
  const [email, setEmail] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (refParam) {
      setRef(refParam);
    } else {
      setRef((prev) => prev ?? crypto.randomUUID());
    }
  }, [refParam]);

  async function handleContinue(overrideRef?: string, isRetry = false) {
    if (loading && !isRetry) return;

    // Email is optional, but if provided it must be valid. Normalize first so a
    // visually-correct address carrying invisible characters (zero-width spaces,
    // BOMs, nbsp from paste/autofill) isn't wrongly rejected by the server as
    // "Invalid email". Validate inline so the feedback lands on the field rather
    // than looking like the payment itself failed.
    const cleanEmail = normalizeEmail(email);
    if (cleanEmail && !looksLikeEmail(cleanEmail)) {
      setError("That email doesn't look right. Fix it, or leave it blank.");
      return;
    }
    if (cleanEmail !== email) setEmail(cleanEmail);

    // Ensure we always have a ref before posting.
    const orderRef = overrideRef ?? ref ?? crypto.randomUUID();
    if (orderRef !== ref) setRef(orderRef);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          plan,
          ref: orderRef,
          device: device || undefined,
          email: cleanEmail || undefined,
          appVersion: v || undefined,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as CheckoutResponse;

      // 409 = this ref is already pinned to a different plan (e.g. the buyer
      // changed plan after a prior Continue). Retry once with a fresh ref so the
      // new plan gets a clean order instead of a dead-end.
      if (res.status === 409 && !isRetry) {
        return handleContinue(crypto.randomUUID(), true);
      }

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      if (data.alreadyPaid || !data.invoiceUrl) {
        router.push(`/buy/success?ref=${encodeURIComponent(orderRef)}`);
        return;
      }

      // Hand off to the external invoice. Keep loading=true through the redirect.
      window.location.href = data.invoiceUrl;
    } catch {
      setError("Network error. Check your connection and try again.");
      setLoading(false);
    }
  }

  const switchQuery = carryParams({}, ref, device, v);
  const statusHref = ref
    ? `/buy/success?ref=${encodeURIComponent(ref)}`
    : "/buy/success";

  return (
    <section className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <Badge variant="muted" className="mb-3">
            <Lock className="mr-1.5 h-3.5 w-3.5 text-teal" /> Step 2 of 2
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Checkout
          </h1>
        </div>
        <Link
          href={`/buy${switchQuery ? `?${switchQuery}` : ""}`}
          className="shrink-0 text-sm text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
        >
          Change plan
        </Link>
      </div>

      <div className="glass relative overflow-hidden rounded-2xl">
        <div className="glow-teal pointer-events-none absolute inset-x-0 top-0 h-32" />

        {/* Summary header */}
        <div className="relative flex items-baseline justify-between gap-4 border-b border-[rgba(58,43,36,0.08)] p-5">
          <div>
            <div className="text-sm font-medium text-muted">
              soundn&apos;t Pro
            </div>
            <div className="mt-0.5 text-lg font-semibold text-fg">
              {planDef.term}
              {planDef.highlight ? (
                <Badge className="ml-2 align-middle">Best value</Badge>
              ) : null}
            </div>
            <div className="tnum mt-1 text-xs text-faint">
              {planDef.perMonth}
              {planDef.save ? (
                <span className="ml-2 text-teal">save {planDef.save}</span>
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

        {/* Pay-with-crypto explainer */}
        <div className="relative space-y-4 p-5">
          <div className="flex items-start gap-3">
            <Bitcoin className="mt-0.5 h-5 w-5 shrink-0 text-teal" />
            <div>
              <div className="text-sm font-semibold text-fg">Pay with crypto</div>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Pick from 300+ coins on the next screen. No account, no card.
              </p>
              <p className="tnum mt-2 text-xs text-faint">
                {SUPPORTED_COINS.join(", ")} and 300+ more
              </p>
            </div>
          </div>

          {/* Optional email */}
          <div>
            <label
              htmlFor="buy-email"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Email me the key (optional)
            </label>
            <Input
              id="buy-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <p className="mt-1.5 text-xs text-faint">
              We&apos;ll email your signed license so you can re-activate any
              device. The app also picks it up automatically.
            </p>
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
            onClick={() => handleContinue()}
            disabled={loading || !ref}
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Creating invoice…
              </>
            ) : (
              <>
                Continue to payment <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Reassurance footnote */}
      <div className="mt-4 space-y-2 text-center">
        <p className="text-xs text-faint">
          You&apos;ll be able to return to soundn&apos;t and it activates
          automatically.
        </p>
        <p className="text-xs text-faint">
          <Link
            href={statusHref}
            className="text-muted underline-offset-4 transition-colors hover:text-fg hover:underline"
          >
            Already paid? Check status
          </Link>
        </p>
      </div>
    </section>
  );
}
