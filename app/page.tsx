import Link from "next/link";
import Image from "next/image";
import { Cpu, ShieldCheck, Zap, Bitcoin, Download, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { ShaderBackground } from "@/components/shader-background";
import { PlanCard } from "@/components/site/plan-card";
import { Badge } from "@/components/ui/badge";
import { PLAN_ORDER, PLANS } from "@/lib/plans";

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <ShaderBackground />
          <div className="relative z-10 mx-auto max-w-6xl animate-fade-in px-4 pb-24 pt-16 text-center sm:pt-24">
            {/* full wordmark with soft coral glow */}
            <div className="mx-auto mb-8 flex justify-center">
              <span className="relative inline-flex">
                <span className="absolute -inset-x-6 inset-y-0 bg-teal/20 blur-3xl" />
                <Image
                  src="/full-logo.png"
                  alt="soundn't"
                  width={457}
                  height={108}
                  priority
                  className="relative h-auto w-[260px] sm:w-[340px]"
                />
              </span>
            </div>

            <Badge variant="muted" className="mb-5 backdrop-blur">
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-teal" /> Runs 100% on your machine
            </Badge>

            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-[1.05] tracking-tight text-fg sm:text-6xl">
              Kill background noise on your mic.{" "}
              <span className="accent-italic text-glow text-teal">Locally.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted sm:text-lg">
              soundn&apos;t is real-time AI microphone noise suppression — a no-account, no-cloud
              Krisp alternative. Free to install with a 7-day Pro trial.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="#download"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal px-7 text-base font-semibold text-teal-fg shadow-lg shadow-teal/25 transition-all hover:bg-teal/90 hover:shadow-teal/40"
              >
                <Download className="h-4 w-4" /> Download for Windows
              </Link>
              <Link
                href="#pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-teal/40 bg-teal/10 px-7 text-base font-medium text-teal backdrop-blur transition-colors hover:border-teal/60 hover:bg-teal/20"
              >
                See Pro pricing
              </Link>
            </div>
            <p className="mt-4 text-xs text-faint">No card needed · Pay with crypto when you go Pro</p>
          </div>
        </section>

        {/* Value props */}
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: Cpu,
                title: "Fully local",
                body: "Audio never leaves your device. No servers, no telemetry on your voice.",
              },
              {
                icon: ShieldCheck,
                title: "No account",
                body: "Install and go. Your license is a signed key — verified offline, even without internet.",
              },
              {
                icon: Zap,
                title: "Real-time",
                body: "Low-latency suppression that works in every app: calls, streams, recordings.",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="glass rounded-xl p-5 transition-transform duration-300 hover:-translate-y-0.5"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal/10 ring-1 ring-teal/20">
                  <f.icon className="h-5 w-5 text-teal" />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-fg">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <div className="mb-9 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              Go Pro. Pay in <span className="accent-italic text-teal">crypto.</span>
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-muted sm:text-base">
              Pro unlocks unlimited noise suppression after your trial. Prepaid terms — longer is
              cheaper per month. Buy more when it lapses; no auto-charge, ever.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_ORDER.map((id) => (
              <PlanCard key={id} plan={PLANS[id]} />
            ))}
          </div>

          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-faint">
            <Bitcoin className="h-3.5 w-3.5 text-teal" />
            BTC, ETH, USDT, LTC, SOL, XMR and 300+ more · powered by NOWPayments
          </div>
        </section>

        {/* Download */}
        <section id="download" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14">
          <div className="glass glass-teal relative overflow-hidden rounded-2xl p-10 text-center">
            <div className="glow-teal pointer-events-none absolute inset-x-0 top-0 h-44" />
            <div className="relative mx-auto mb-5 flex justify-center">
              <Image
                src="/full-logo.png"
                alt="soundn't"
                width={457}
                height={108}
                className="h-auto w-[180px] sm:w-[220px]"
              />
            </div>
            <h2 className="relative text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Try it free
            </h2>
            <p className="relative mx-auto mt-2 max-w-md text-sm text-muted">
              Download soundn&apos;t for Windows. Pro is unlocked for 7 days — no payment, no account.
            </p>
            <div className="relative mt-7">
              <a
                href="https://github.com/giorgishonia/soundnt-releases/releases/latest/download/soundnt-x64-setup.exe"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-teal px-7 text-base font-semibold text-teal-fg shadow-lg shadow-teal/25 transition-all hover:bg-teal/90 hover:shadow-teal/40"
              >
                <Download className="h-4 w-4" /> Download for Windows
              </a>
              <p className="mt-3 text-xs text-faint">Windows 10/11 · 64-bit · auto-updates</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl px-4 py-14">
          <h2 className="mb-7 text-center text-2xl font-bold tracking-tight text-fg">Questions</h2>
          <div className="glass divide-y divide-[rgba(58,43,36,0.08)] overflow-hidden rounded-2xl">
            {[
              {
                q: "Why crypto only?",
                a: "It keeps soundn't account-free and private — no card-on-file, no merchant-of-record. You pay once per term; nothing recurring.",
              },
              {
                q: "How does activation work?",
                a: "After payment we mint a cryptographically signed license. The app picks it up automatically (it's also emailed and shown on-screen). It verifies offline — your license works without internet.",
              },
              {
                q: "How many devices?",
                a: "Up to 3 devices per license. You can free a slot anytime from the My licenses page.",
              },
              {
                q: "What if I need a refund?",
                a: "Reach out to support. Revoked licenses lock on the app's next check.",
              },
            ].map((item) => (
              <div key={item.q} className="p-5">
                <h3 className="text-sm font-semibold text-fg">{item.q}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
