"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const sparklinePath =
  "M2 24C8 10 18 6 30 16C42 26 52 12 64 18C76 24 86 8 98 14";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 hero-grid" aria-hidden="true"></div>
      <div className="absolute inset-0 hero-glow" aria-hidden="true"></div>

      <section className="page-container relative z-10 flex min-h-[calc(100vh-4rem)] items-center py-16">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.45em] text-foreground/70">
                Per-second streaming on Celo
              </p>
              <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                Automate treasury payouts for{" "}
                <span className="hero-gradient-text">DAOs & teams</span>
              </h1>
              <p className="text-lg leading-relaxed text-foreground/80">
                Run per-second contributor streams and recurring billing with
                smart-contract automation, lower ops overhead, and full on-chain
                proof.
              </p>
            </div>

            <div className="hero-cta-row">
              <Button className="hero-cta-button" asChild>
                <Link href="/streams/create" className="flex items-center gap-2">
                  Start payouts
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="hero-cta-outline" asChild>
                <Link href="/dashboard" className="flex items-center gap-2">
                  Open treasury dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60">
              <span className="hero-badge">DAOs & collectives</span>
              <span className="hero-badge">Per-second accrual</span>
              <span className="hero-badge">Creator teams</span>
              <span className="hero-badge">Service platforms</span>
            </div>

            <div className="hero-invite-card">
              <p className="text-sm font-semibold text-white">Built for ops leads</p>
              <p className="text-sm text-foreground/70">
                Replace spreadsheet ops with autonomous per-second streams and
                audit-ready payout records.
              </p>
              <div className="mt-2 flex items-center justify-between gap-4 text-xs text-foreground/80">
                <span>On-chain proof for every transfer</span>
                <Button variant="ghost" className="hero-invite-btn">
                  Learn more
                </Button>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="hero-card hero-spotlight card-glow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-foreground/50">
                    Live treasury
                  </p>
                  <p className="text-2xl font-bold text-white">$184,320</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.4em] text-foreground/50">
                    Live stream rate
                  </p>
                  <p className="text-lg font-semibold text-green">
                    0.42 cUSD / sec
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between text-sm text-foreground/75">
                    <span>Treasury Balance</span>
                    <span className="font-semibold text-white">34,500 cUSD</span>
                  </div>
                  <div className="hero-sparkline mt-3">
                    <svg
                      viewBox="0 0 100 30"
                      preserveAspectRatio="none"
                      className="h-full w-full"
                    >
                      <path d={sparklinePath} className="hero-sparkline-path" />
                    </svg>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between text-sm text-foreground/75">
                    <span>Subscription Revenue</span>
                    <span className="font-semibold text-white">8,420 cUSD</span>
                  </div>
                  <div className="hero-sparkline mt-3">
                    <svg
                      viewBox="0 0 100 30"
                      preserveAspectRatio="none"
                      className="h-full w-full"
                    >
                      <path d={sparklinePath} className="hero-sparkline-path" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="mt-7 grid gap-3 text-xs text-foreground/80 sm:grid-cols-2">
                <div className="hero-mini-card">
                  <p>Contributors paid</p>
                  <p className="text-lg font-semibold text-white">42</p>
                </div>
                <div className="hero-mini-card">
                  <p>Active streams</p>
                  <p className="text-lg font-semibold text-green">128</p>
                </div>
                <div className="hero-mini-card">
                  <p>Per-second flows</p>
                  <p className="text-lg font-semibold text-white">36</p>
                </div>
                <div className="hero-mini-card">
                  <p>Pending actions</p>
                  <p className="text-lg font-semibold text-white">2</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-foreground/80 animate-pulse-soft">
                <div className="flex items-center justify-between">
                  <span className="uppercase tracking-[0.35em] text-foreground/50">
                    Latest payout
                  </span>
                  <span className="text-green">Confirmed</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-semibold text-white">
                    Contributor #24
                  </span>
                  <span className="text-foreground/70">0.003 cUSD / sec</span>
                </div>
              </div>
            </div>
            <div className="absolute -right-6 -bottom-8 h-24 w-24 rounded-full bg-gradient-to-br from-green/60 to-teal/60 blur-[60px]"></div>
          </div>
        </div>
      </section>

      <section className="page-container relative z-10 pb-20">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-foreground/60">
              Who it’s for
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Built for high-volume payout teams
            </h2>
            <p className="mx-auto max-w-3xl text-sm leading-relaxed text-foreground/75 sm:text-base">
              Designed for teams that need reliable, transparent, and
              programmable payment operations.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="hero-card card-glow space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">
                DAOs & collectives
              </p>
              <h3 className="text-xl font-semibold text-white">
                Automate contributor payouts
              </h3>
              <p className="text-sm leading-relaxed text-foreground/75">
                Run grants, per-second contributor streams, and treasury disbursements
                without manual reconciliation.
              </p>
            </article>

            <article className="hero-card card-glow space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">
                Creator teams
              </p>
              <h3 className="text-xl font-semibold text-white">
                Pay collaborators continuously
              </h3>
              <p className="text-sm leading-relaxed text-foreground/75">
                Stream payments to editors, designers, and operators with
                instant withdrawals and clear payment history.
              </p>
            </article>

            <article className="hero-card card-glow space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">
                Service platforms
              </p>
              <h3 className="text-xl font-semibold text-white">
                Launch programmable billing
              </h3>
              <p className="text-sm leading-relaxed text-foreground/75">
                Support recurring subscriptions and usage-based flows with
                on-chain proof for reconciliation.
              </p>
            </article>
          </div>

          <div className="flex justify-center">
            <Button variant="outline" className="hero-cta-outline" asChild>
              <Link href="/dashboard" className="flex items-center gap-2">
                View treasury metrics
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
