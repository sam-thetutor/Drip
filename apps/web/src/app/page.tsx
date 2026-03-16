"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSuperfluidContractStats } from "@/lib/contracts";
import { formatTokenAmountWithDecimals } from "@/lib/utils/format";

export default function HomePage() {
  const superfluidStats = useSuperfluidContractStats();

  const streamsCreated = superfluidStats.data?.streamsCreated ?? 0;
  const streamedValueWei = superfluidStats.data?.streamedValueWei ?? 0n;
  const outflowRateWeiPerSecond = superfluidStats.data?.outflowRateWeiPerSecond ?? 0n;
  const lastUpdatedTimestampSec = superfluidStats.data?.lastUpdatedTimestampSec ?? 0;

  const streamedValueFormatted = formatTokenAmountWithDecimals(
    streamedValueWei,
    18,
    2
  );

  const outflowPerDayFormatted = formatTokenAmountWithDecimals(
    outflowRateWeiPerSecond * 86400n,
    18,
    2
  );

  const avgPerStreamFormatted = formatTokenAmountWithDecimals(
    streamsCreated > 0 ? streamedValueWei / BigInt(streamsCreated) : 0n,
    18,
    2
  );

  const lastSyncLabel =
    lastUpdatedTimestampSec > 0
      ? new Date(lastUpdatedTimestampSec * 1000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "--:--";

  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-0 hero-grid" aria-hidden="true"></div>
      <div className="absolute inset-0 hero-glow" aria-hidden="true"></div>

      <section className="page-container relative z-10 flex min-h-[calc(100vh-4rem)] items-center py-16">
        <div className="grid w-full grid-cols-1 gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-8">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.45em] text-foreground/70">
                Per-second streaming on GoodDollar
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

          <div className="relative h-full">
            <div className="hero-card hero-spotlight card-glow h-full">
              <div className="relative flex h-full flex-col">
                <div className="absolute -top-10 -right-16 h-36 w-36 rounded-full bg-green/20 blur-3xl" aria-hidden="true" />
                <div className="absolute bottom-8 -left-14 h-28 w-28 rounded-full bg-teal-400/20 blur-3xl" aria-hidden="true" />

                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-[0.42em] text-foreground/55">
                    Live Stream Metrics
                  </p>
                  <span className="flex items-center gap-1.5 rounded-full border border-green/35 bg-green/10 px-3 py-1 text-[11px] font-medium text-green">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green" />
                    Celo Mainnet
                  </span>
                </div>

                <div className="mt-6 grid gap-4">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-foreground/50">
                      Value in Streams
                    </p>
                    <p className="mt-2 text-4xl font-black leading-none text-white sm:text-5xl">
                      {superfluidStats.isLoading ? "…" : streamedValueFormatted}
                      <span className="ml-2 text-xl font-semibold text-green sm:text-2xl">G$</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-green/25 bg-green/[0.04] p-4">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-foreground/55">
                      Streams Created
                    </p>
                    <div className="mt-2 flex items-end justify-between">
                      <p className="text-4xl font-bold leading-none text-green">
                        {superfluidStats.isLoading ? "…" : streamsCreated}
                      </p>
                      <p className="text-xs uppercase tracking-[0.22em] text-foreground/60">
                        Total
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div className="hero-mini-card">
                      <p className="uppercase tracking-[0.2em] text-foreground/55">Outflow / Day</p>
                      <p className="mt-2 text-base font-semibold text-white">
                        {superfluidStats.isLoading ? "…" : `${outflowPerDayFormatted} G$`}
                      </p>
                    </div>
                    <div className="hero-mini-card">
                      <p className="uppercase tracking-[0.2em] text-foreground/55">Avg / Stream</p>
                      <p className="mt-2 text-base font-semibold text-white">
                        {superfluidStats.isLoading ? "…" : `${avgPerStreamFormatted} G$`}
                      </p>
                    </div>
                    <div className="hero-mini-card">
                      <p className="uppercase tracking-[0.2em] text-foreground/55">Last Sync</p>
                      <p className="mt-2 text-base font-semibold text-green">
                        {superfluidStats.isLoading ? "…" : lastSyncLabel}
                      </p>
                    </div>
                    <div className="hero-mini-card">
                      <p className="uppercase tracking-[0.2em] text-foreground/55">Data Source</p>
                      <p className="mt-2 text-base font-semibold text-green">Subgraph</p>
                    </div>
                  </div>

                <div className="mt-auto pt-4">
                  <div className="h-px w-full bg-gradient-to-r from-transparent via-green/70 to-transparent" />
                  <p className="mt-3 text-xs tracking-[0.08em] text-foreground/60">
                    Powered by Superfluid on Celo Mainnet
                  </p>
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
