import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Privacy</h1>
        <p className="mt-2 text-sm text-muted">soundn&apos;t is built to know as little about you as possible.</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="text-base font-semibold text-fg">Your audio stays local</h2>
            <p className="mt-1.5">
              Noise suppression runs entirely on your machine. Your microphone audio is never sent
              to us or anyone else.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">What we store</h2>
            <p className="mt-1.5">
              Only what&apos;s needed to sell and support a license: your plan, payment status, the
              signed license, an optional email you choose to give us, and per-install random IDs
              (a device id and order ref). To enforce your plan&apos;s device limit and to detect
              license sharing or abuse, we also store a salted, one-way{" "}
              <strong>device fingerprint</strong> derived from your computer&apos;s network-adapter
              (MAC) address, along with the IP address and app version captured when a device
              activates. We never store the raw hardware address — only the salted hash, which
              can&apos;t be reversed back to it — and we don&apos;t track or profile your usage.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Payments</h2>
            <p className="mt-1.5">
              Crypto payments are processed by our payment provider. We never see card details and
              there is no merchant-of-record account.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Deletion</h2>
            <p className="mt-1.5">
              Want your data removed? Email{" "}
              <a href="mailto:support@soundnt.app" className="text-teal hover:underline">
                support@soundnt.app
              </a>{" "}
              and we&apos;ll delete your license and any associated records on request.
            </p>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
