import { Suspense } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { SuccessClient } from "./success-client";

// Reads the `ref` query param on the client and polls order status.
export const dynamic = "force-dynamic";

function SuccessFallback() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <div className="rounded-lg border border-border bg-surface p-8">
        <div className="shimmer h-5 w-40 rounded bg-elevated" />
        <div className="shimmer mt-4 h-4 w-full rounded bg-elevated" />
        <div className="shimmer mt-2 h-4 w-2/3 rounded bg-elevated" />
      </div>
    </div>
  );
}

export default function BuySuccessPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="glow-teal pointer-events-none absolute inset-x-0 top-0 h-[320px]" />
          <Suspense fallback={<SuccessFallback />}>
            <SuccessClient />
          </Suspense>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
