import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { env } from "@/lib/env";
import { DemoPayClient } from "./demo-pay-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Demo checkout — soundn't",
  description: "Simulated crypto checkout for the soundn't demo. No real payment.",
};

function DemoPayFallback() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="h-7 w-48 animate-pulse rounded-md bg-elevated" />
      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <div className="h-5 w-32 animate-pulse rounded-md bg-elevated" />
        <div className="mt-4 h-10 w-40 animate-pulse rounded-md bg-elevated" />
        <div className="mt-6 h-11 w-full animate-pulse rounded-md bg-elevated" />
      </div>
    </div>
  );
}

export default function DemoPayPage() {
  // This page only exists on a demo deployment.
  if (!env.demoMode()) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<DemoPayFallback />}>
          <DemoPayClient />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
