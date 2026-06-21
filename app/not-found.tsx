import Link from "next/link";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <div className="tnum text-6xl font-bold tracking-tight text-teal">404</div>
        <h1 className="mt-4 text-xl font-semibold text-fg">Page not found</h1>
        <p className="mt-2 text-sm text-muted">That page doesn&apos;t exist (or moved).</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-teal px-5 text-sm font-semibold text-teal-fg transition-colors hover:bg-teal/90"
        >
          Back home
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
