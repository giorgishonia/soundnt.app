import Link from "next/link";
import { Logo } from "@/components/site/logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[rgba(58,43,36,0.08)] bg-bg/40 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="hidden text-faint sm:inline">· local AI mic noise suppression</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/account" className="transition-colors hover:text-fg">
            My licenses
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-fg">
            Privacy
          </Link>
          <a href="mailto:support@soundnt.app" className="transition-colors hover:text-fg">
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
