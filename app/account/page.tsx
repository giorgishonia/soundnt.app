import { Suspense } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { AccountClient } from "./account-client";

export const dynamic = "force-dynamic";

function AccountFallback() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <div className="h-6 w-40 animate-pulse rounded bg-elevated" />
      <div className="mt-6 h-32 w-full animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Suspense fallback={<AccountFallback />}>
          <AccountClient />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
