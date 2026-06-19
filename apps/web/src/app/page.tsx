"use client";

import Link from "next/link";
import { ArrowRight, Home, PiggyBank, Users } from "lucide-react";
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
        <div className="grid w-full grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          {/* ── Left: pitch ── */}
          <div className="space-y-7">
            <div className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.45em] text-foreground/70">
                Automatic money plans
              </p>
              <h1 className="text-4xl font-bold leading-[1.05] text-white sm:text-5xl lg:text-[4rem]">
                Every dollar
                <br />
                on <span className="hero-shine">autopilot</span>
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-foreground/80">
                Pour your money into one pool, split it into buckets — bills,
                family, savings — and Drip streams the right amount to each one,
                second by second. Saving without the willpower.
              </p>
            </div>

            <div className="hero-cta-row">
              <Button className="hero-cta-button" asChild>
                <Link href="/streams/create" className="flex items-center gap-2">
                  Set up my plan
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="hero-cta-outline" asChild>
                <Link href="/dashboard" className="flex items-center gap-2">
                  See my money
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60">
              <span className="hero-badge">Save on autopilot</span>
              <span className="hero-badge">Bills paid on time</span>
              <span className="hero-badge">Support family</span>
              <span className="hero-badge">No willpower needed</span>
            </div>
          </div>

          {/* ── Right: live money-flow diagram ── */}
          <div className="relative h-full">
            <div className="hero-card hero-spotlight card-glow h-full">
              <div className="relative flex h-full flex-col">
                <div className="absolute -top-10 -right-16 h-36 w-36 rounded-full bg-green/20 blur-3xl" aria-hidden="true" />
                <div className="absolute bottom-8 -left-14 h-28 w-28 rounded-full bg-teal-400/20 blur-3xl" aria-hidden="true" />

                {/* Flow stage: pool → pipes → buckets */}
                <div className="flow-stage">
                  <div className="flow-source">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-teal-200/70">
                      Your money pool
                    </p>
                    <p className="mt-1.5 text-3xl font-black leading-none text-white sm:text-4xl">
                      {superfluidStats.isLoading ? "…" : streamedValueFormatted}
                      <span className="ml-1.5 text-lg font-semibold text-green">G$</span>
                    </p>
                    <p className="mt-1.5 text-[11px] text-foreground/55">
                      {superfluidStats.isLoading
                        ? "syncing…"
                        : `${streamsCreated} active plans · ${outflowPerDayFormatted} G$/day flowing`}
                    </p>
                  </div>

                  <svg
                    className="flow-pipes"
                    viewBox="0 0 300 78"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path className="flow-pipe" d="M150 2 C150 38 50 40 50 76" />
                    <path className="flow-pipe" d="M150 2 L150 76" />
                    <path className="flow-pipe" d="M150 2 C150 38 250 40 250 76" />
                    <path className="flow-pipe-active" d="M150 2 C150 38 50 40 50 76" />
                    <path className="flow-pipe-active delay-1" d="M150 2 L150 76" />
                    <path className="flow-pipe-active delay-2" d="M150 2 C150 38 250 40 250 76" />
                  </svg>

                  <div className="flow-buckets">
                    <div className="flow-bucket">
                      <span className="flow-bucket-liquid b1" />
                      <span className="flow-bucket-icon">
                        <Home className="h-3.5 w-3.5" />
                      </span>
                      <span className="flow-bucket-label">
                        <span className="block text-sm font-semibold text-white">Bills</span>
                        <span className="block text-[10px] text-foreground/55">on time</span>
                      </span>
                    </div>
                    <div className="flow-bucket">
                      <span className="flow-bucket-liquid b2" />
                      <span className="flow-bucket-icon">
                        <PiggyBank className="h-3.5 w-3.5" />
                      </span>
                      <span className="flow-bucket-label">
                        <span className="block text-sm font-semibold text-white">Savings</span>
                        <span className="block text-[10px] text-foreground/55">growing</span>
                      </span>
                    </div>
                    <div className="flow-bucket">
                      <span className="flow-bucket-liquid b3" />
                      <span className="flow-bucket-icon">
                        <Users className="h-3.5 w-3.5" />
                      </span>
                      <span className="flow-bucket-label">
                        <span className="block text-sm font-semibold text-white">Family</span>
                        <span className="block text-[10px] text-foreground/55">supported</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Live stats strip */}
                <div className="mt-5 grid grid-cols-3 gap-3 text-xs">
                  <div className="hero-mini-card">
                    <p className="uppercase tracking-[0.18em] text-foreground/55">Plans</p>
                    <p className="mt-1.5 text-base font-semibold text-green">
                      {superfluidStats.isLoading ? "…" : streamsCreated}
                    </p>
                  </div>
                  <div className="hero-mini-card">
                    <p className="uppercase tracking-[0.18em] text-foreground/55">Avg / plan</p>
                    <p className="mt-1.5 text-base font-semibold text-white">
                      {superfluidStats.isLoading ? "…" : avgPerStreamFormatted}
                    </p>
                  </div>
                  <div className="hero-mini-card">
                    <p className="uppercase tracking-[0.18em] text-foreground/55">Last sync</p>
                    <p className="mt-1.5 text-base font-semibold text-green">
                      {superfluidStats.isLoading ? "…" : lastSyncLabel}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -right-6 -bottom-8 h-24 w-24 rounded-full bg-gradient-to-br from-green/60 to-teal/60 blur-[60px]"></div>
          </div>
        </div>
      </section>

      {/* Manifesto — why we built Drip */}
      <section className="page-container relative z-10 pb-20">
        <div className="mx-auto w-full max-w-5xl space-y-10">
          <div className="space-y-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-foreground/60">
              Why we built Drip
            </p>
            <h2 className="mx-auto max-w-3xl text-3xl font-bold leading-[1.15] text-white sm:text-4xl">
              Money has places to be.{" "}
              <span className="text-green">Getting it there shouldn’t be manual.</span>
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-foreground/75 sm:text-base">
              Every cycle, the same choreography: rent and bills, savings and
              goals, the family you support, the people who work for you, the
              subscriptions that keep things running. Each needs a different
              amount, on a different schedule — and doing it all by hand, on time,
              every time, is a job nobody actually has time for.
            </p>
          </div>

          {/* Grounding stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="hero-card card-glow space-y-1 text-center">
              <p className="text-4xl font-black leading-none text-green">62%</p>
              <p className="text-sm leading-relaxed text-foreground/70">
                of people don’t have enough set aside to cover three months of
                expenses.
              </p>
            </div>
            <div className="hero-card card-glow space-y-1 text-center">
              <p className="text-4xl font-black leading-none text-green">1 in 10</p>
              <p className="text-sm leading-relaxed text-foreground/70">
                couldn’t go a single week between paychecks without coming up
                short.
              </p>
            </div>
            <div className="hero-card card-glow space-y-1 text-center">
              <p className="text-4xl font-black leading-none text-green">90%+</p>
              <p className="text-sm leading-relaxed text-foreground/70">
                follow through when money moves automatically — far more than
                when it’s left to memory.
              </p>
            </div>
          </div>

          {/* The belief */}
          <div className="mx-auto max-w-3xl space-y-5">
            <p className="text-base leading-relaxed text-foreground/80">
              The problem isn’t that people are careless — it’s that we’re wired
              to value today over tomorrow. Economists call it{" "}
              <span className="font-medium text-white">present bias</span>, and it
              quietly sabotages anything that has to happen later: the transfer
              you meant to make, the worker you meant to pay, the goal you meant
              to fund. The more obligations money has to be split across, the more
              cracks it slips through.
            </p>
            <p className="text-base leading-relaxed text-foreground/80">
              Spreadsheets, reminders and manual transfers all lean on the things
              that run out fastest: attention and willpower. The research is blunt
              about what actually works — when money moves{" "}
              <span className="font-medium text-white">by default</span>, almost
              everyone follows through. So we stopped asking people to be more
              disciplined, and started making allocation automatic.
            </p>

            <div className="space-y-3 rounded-2xl border border-green/20 bg-green/[0.04] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-green">
                What we believe
              </p>
              <ul className="space-y-3 text-sm leading-relaxed text-foreground/80 sm:text-base">
                <li>
                  <span className="font-medium text-white">
                    Money should arrive already allocated
                  </span>{" "}
                  — split across bills, savings, people and goals the moment it
                  lands, not whenever you remember.
                </li>
                <li>
                  <span className="font-medium text-white">
                    Paying others should be as effortless as paying yourself
                  </span>{" "}
                  — a worker every week, a team every month, a subscription every
                  cycle: set once, never chased again.
                </li>
                <li>
                  <span className="font-medium text-white">
                    Automation should be yours to control
                  </span>{" "}
                  — pausable, adjustable, and provable on-chain, never a black box.
                </li>
              </ul>
            </div>

            <p className="text-base leading-relaxed text-foreground/80">
              Drip turns a plan you set once into money that moves on its own —
              whether you’re budgeting your own income across buckets, paying the
              people who work for you on time, or running recurring payouts and
              subscriptions. One plan, every obligation handled —{" "}
              <span className="font-medium text-white">allocation on autopilot.</span>
            </p>
          </div>
        </div>
      </section>

      <section className="page-container relative z-10 pb-20">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <div className="space-y-3 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-foreground/60">
              How it works
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              Three steps to money on autopilot
            </h2>
            <p className="mx-auto max-w-3xl text-sm leading-relaxed text-foreground/75 sm:text-base">
              Set it once and Drip keeps your plan running — no spreadsheets, no
              reminders, no willpower required.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <article className="hero-card card-glow space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">
                Step 1
              </p>
              <h3 className="text-xl font-semibold text-white">
                Add money
              </h3>
              <p className="text-sm leading-relaxed text-foreground/75">
                Top up with mobile money or crypto. Your balance is the pool you
                plan from.
              </p>
            </article>

            <article className="hero-card card-glow space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">
                Step 2
              </p>
              <h3 className="text-xl font-semibold text-white">
                Split it into buckets
              </h3>
              <p className="text-sm leading-relaxed text-foreground/75">
                Rent, savings, family, that subscription — decide how much each
                gets and how often.
              </p>
            </article>

            <article className="hero-card card-glow space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-foreground/50">
                Step 3
              </p>
              <h3 className="text-xl font-semibold text-white">
                Let it flow
              </h3>
              <p className="text-sm leading-relaxed text-foreground/75">
                Drip streams the right amount to each bucket automatically. Pause,
                top up, or adjust anytime.
              </p>
            </article>
          </div>

          <div className="flex justify-center">
            <Button variant="outline" className="hero-cta-outline" asChild>
              <Link href="/streams/create" className="flex items-center gap-2">
                Set up my plan
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
