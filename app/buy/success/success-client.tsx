"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  HelpCircle,
  RefreshCw,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyField } from "@/components/copy-field";
import { PLANS, type PlanId } from "@/lib/plans";

const POLL_MS = 3000;

interface License {
  token: string;
  lic: string;
  plan: string;
  /** UNIX seconds. */
  exp: number;
  email?: string;
}

type OrderResponse =
  | { status: "pending" }
  | { status: "paid"; license: License }
  | { status: "expired" };

/** UI state: "checking" covers transient fetch errors so the page never crashes. */
type UiStatus = "loading" | "pending" | "paid" | "expired" | "checking";

function formatExpiry(expSeconds: number): string {
  return new Date(expSeconds * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto max-w-xl px-4 pb-20 pt-16 sm:pt-20">{children}</div>
  );
}

export function SuccessClient() {
  const sp = useSearchParams();
  const ref = sp.get("ref");

  const [status, setStatus] = React.useState<UiStatus>(ref ? "loading" : "checking");
  const [license, setLicense] = React.useState<License | null>(null);

  // Used to trigger an immediate manual re-check from the "Check again" button.
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!ref) return;

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    async function poll() {
      try {
        const res = await fetch(`/api/order/${encodeURIComponent(ref!)}`, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });

        if (!res.ok) {
          // Transient/server error — keep the user on a calm "checking" state and retry.
          if (active) {
            setStatus((prev) => (prev === "paid" ? prev : "checking"));
          }
          return;
        }

        const data = (await res.json()) as OrderResponse;
        if (!active) return;

        if (data.status === "paid") {
          setLicense(data.license);
          setStatus("paid");
          stop();
        } else if (data.status === "expired") {
          setStatus("expired");
          stop();
        } else {
          setStatus("pending");
        }
      } catch {
        // Network hiccup — don't crash; stay in checking and let the interval retry.
        if (active) {
          setStatus((prev) => (prev === "paid" ? prev : "checking"));
        }
      }
    }

    // Fire immediately, then on an interval until a terminal state stops it.
    poll();
    timer = setInterval(poll, POLL_MS);

    return () => {
      active = false;
      stop();
    };
  }, [ref, nonce]);

  // --- No ref: gentle recovery message -------------------------------------
  if (!ref) {
    return (
      <Shell>
        <Card className="animate-fade-in">
          <CardContent className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-elevated">
              <HelpCircle className="h-6 w-6 text-muted" aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-fg">
              No order reference
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              We couldn&apos;t find an order to track on this page. If you already
              paid, you can look up and recover your license key from your account.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/account">Recover a key</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/#pricing">See pricing</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // --- Paid: success -------------------------------------------------------
  if (status === "paid" && license) {
    const plan = PLANS[license.plan as PlanId];
    return (
      <Shell>
        <div className="animate-fade-in">
          <div className="flex flex-col items-center text-center">
            <span className="glow-teal flex h-14 w-14 items-center justify-center rounded-full border border-teal/25 bg-teal/15">
              <CheckCircle2 className="h-7 w-7 text-teal" aria-hidden />
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              You&apos;re Pro <span aria-hidden>🎉</span>
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
              Payment confirmed. Your license is minted and ready.
            </p>
          </div>

          <Card className="mt-8">
            <CardContent className="space-y-5">
              <CopyField value={license.token} label="Your license key" />

              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-muted">License ID</dt>
                  <dd className="tnum mt-0.5 break-all font-mono text-sm text-fg">
                    {license.lic}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Plan</dt>
                  <dd className="mt-0.5 text-sm text-fg">
                    {plan ? plan.term : license.plan}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Active until</dt>
                  <dd className="tnum mt-0.5 text-sm text-fg">
                    {formatExpiry(license.exp)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted">Status</dt>
                  <dd className="mt-0.5">
                    <Badge variant="success">Active</Badge>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <div className="mt-6 rounded-lg border border-teal/25 bg-teal/[0.06] p-5 text-center">
            <p className="text-sm font-semibold text-fg">
              Return to soundn&apos;t — it&apos;s unlocking automatically.
            </p>
            {license.email ? (
              <p className="mt-1.5 inline-flex items-center justify-center gap-1.5 text-xs text-muted">
                <Mail className="h-3.5 w-3.5 text-teal" aria-hidden />
                We also emailed it to {license.email}.
              </p>
            ) : null}
          </div>

          <p className="mt-4 text-center text-xs leading-relaxed text-faint">
            If the app doesn&apos;t pick it up, copy the key above and paste it
            manually in soundn&apos;t → Settings → Activate license.
          </p>

          <div className="mt-6 flex justify-center">
            <Button asChild variant="outline" size="sm">
              <Link href="/account">View my licenses</Link>
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Expired / failed terminal -------------------------------------------
  if (status === "expired") {
    return (
      <Shell>
        <Card className="animate-fade-in">
          <CardContent className="flex flex-col items-center text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/25 bg-danger/15">
              <XCircle className="h-6 w-6 text-danger" aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-fg">
              This order expired
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              We didn&apos;t receive payment in time, or the invoice was cancelled.
              No charge was made. You can start a new order whenever you&apos;re
              ready — it only takes a minute.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/buy">Start a new order</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/account">Recover an existing key</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  // --- Pending / loading / checking (keep polling) -------------------------
  const isChecking = status === "checking";
  return (
    <Shell>
      <Card className="animate-fade-in">
        <CardContent className="flex flex-col items-center text-center">
          <span
            className="relative flex h-12 w-12 items-center justify-center rounded-full border border-teal/25 bg-teal/10"
            aria-hidden
          >
            {isChecking ? (
              <Loader2 className="h-6 w-6 animate-spin text-teal" />
            ) : (
              <>
                <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-teal/60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-teal" />
              </>
            )}
          </span>

          <h1 className="mt-4 inline-flex items-center gap-2 text-xl font-bold tracking-tight text-fg">
            {isChecking ? (
              "Checking your order…"
            ) : (
              <>
                <Clock className="h-4 w-4 text-teal" aria-hidden />
                Waiting for payment confirmation…
              </>
            )}
          </h1>

          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            {isChecking
              ? "We had trouble reaching the server for a moment — retrying automatically. You can stay on this page."
              : "Hang tight. Some coins take a few network confirmations before a payment is final, which can take a few minutes. This page updates on its own — no need to refresh."}
          </p>

          <div className="mt-6 w-full max-w-sm">
            <div className="shimmer h-1.5 w-full overflow-hidden rounded-full bg-elevated" />
          </div>

          <div className="mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatus("checking");
                setNonce((n) => n + 1);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Check again
            </Button>
          </div>

          <p className="mt-5 text-xs text-faint">
            Keep this tab open and the soundn&apos;t app running — it unlocks the
            moment payment clears.
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}
