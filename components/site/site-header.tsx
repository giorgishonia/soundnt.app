import Link from "next/link";
import { Logo } from "@/components/site/logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(58,43,36,0.08)] bg-bg/55 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-1 text-sm text-muted sm:gap-2">
          <Link
            href="/#pricing"
            className="hidden rounded-md px-3 py-1.5 transition-colors hover:bg-[rgba(58,43,36,0.06)] hover:text-fg sm:inline-flex"
          >
            Pricing
          </Link>
          <Link
            href="/account"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-[rgba(58,43,36,0.06)] hover:text-fg"
          >
            My licenses
          </Link>
          <Link
            href="/#download"
            className="ml-1 inline-flex items-center rounded-md bg-teal/10 px-3 py-1.5 font-medium text-teal ring-1 ring-teal/25 transition-colors hover:bg-teal/20"
          >
            Download
          </Link>
        </nav>
      </div>
    </header>
  );
}
