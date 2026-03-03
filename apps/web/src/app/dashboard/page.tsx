"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import {
  ArrowRight,
  Zap,
  Phone,
  Trophy,
  Wallet,
  Gift,
  ShoppingBag,
  TrendingUp,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HomeDashboardCards } from "@/components/home-dashboard-cards";
import { VoteForDrip } from "@/components/gooddollar/vote-for-drip";
import { useAllUserStreams } from "@/lib/contracts";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";
import { formatTokenAmountWithDecimals } from "@/lib/utils/format";
import { isSupportedChain } from "@/lib/gooddollar/utils";

export default function DashboardPage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { streams, isLoading: streamsLoading } = useAllUserStreams(address as `0x${string}` | undefined);
  const goodDollarAddress = getTokenAddressBySymbol("G$", chainId);
  const { data: goodDollarBalance, isLoading: goodDollarLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    token: goodDollarAddress,
    query: {
      enabled: !!address && !!goodDollarAddress,
      refetchInterval: 30000,
      refetchOnWindowFocus: false,
      staleTime: 20 * 1000,
    },
  });

  const activeStreams = useMemo(() => {
    if (!Array.isArray(streams)) return [];
    return streams.filter((stream: any) => Number(stream.status ?? 0) === 1);
  }, [streams]);

  const activeStreamsCount = activeStreams.length;

  const recipientSamples = useMemo(() => {
    if (activeStreamsCount === 0) return [];
    const labels: string[] = [];
    activeStreams.forEach((stream: any) => {
      (stream.recipients || []).forEach((recipient: string) => {
        if (labels.length < 2) {
          labels.push(`${recipient.slice(0, 6)}...${recipient.slice(-4)}`);
        }
      });
    });
    return labels;
  }, [activeStreams, activeStreamsCount]);


  const goodDollarLabel = !address
    ? "Connect wallet"
    : !goodDollarAddress
      ? "G$ unavailable"
      : goodDollarLoading
        ? "Loading..."
        : `${formatTokenAmountWithDecimals(
            (goodDollarBalance?.value ?? 0n) as bigint,
            goodDollarBalance?.decimals ?? 18,
            2
          )} ${goodDollarBalance?.symbol ?? "G$"}`;

  const isGoodDollarChain = isSupportedChain(chainId);

  return (
    <main className="flex-1">
      <div className="container mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
        <section className="hero-card">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.45em] text-foreground/60">
                Dashboard
              </p>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">
                Drip streams, now routed to{" "}
                <span className="hero-gradient-text">phone numbers</span>
              </h1>
              <p className="text-sm text-foreground/70">
                Continuous streams keep payments flowing in real time. Send
                those streams straight to phone numbers.
              </p>
            </div>
            <div className="hero-cta-row">
              <Button className="hero-cta-button" asChild>
                <Link href="/streams/create" className="flex items-center gap-2">
                  Create stream
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="hero-cta-outline" asChild>
                <Link href="/wallet" className="flex items-center gap-2">
                  Open wallet
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="hero-mini-card">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Quick stream</span>
                <Zap className="h-3.5 w-3.5 text-green" />
              </div>
              <p className="mt-3 text-sm text-white">Start a phone stream</p>
            </div>
            <div className="hero-mini-card">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Send by number</span>
                <Phone className="h-3.5 w-3.5 text-green" />
              </div>
              <p className="mt-3 text-sm text-white">+1 (415) ***-1234</p>
            </div>
            <div className="hero-mini-card">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Rewards</span>
                <Trophy className="h-3.5 w-3.5 text-green" />
              </div>
              <p className="mt-3 text-sm text-white">
                {isGoodDollarChain ? "Claim GoodDollar" : "Switch to Celo"}
              </p>
            </div>
            <div className="hero-mini-card">
              <div className="flex items-center justify-between text-xs text-foreground/60">
                <span>Balance</span>
                <Wallet className="h-3.5 w-3.5 text-green" />
              </div>
              <p className="mt-3 text-sm text-white">{goodDollarLabel}</p>
            </div>
          </div>
        </section>

        {/* Vote for Drip - GoodDollar Builders Round 3 */}
        <VoteForDrip />

        {/* Main Dashboard Cards (Active Streams, UBI Claim, Milestones) */}
        <div className="ripple-field rounded-[32px]">
          <HomeDashboardCards
            activeStreamsCount={activeStreamsCount}
            recipientSamples={recipientSamples}
            isStreamsLoading={streamsLoading}
          />
        </div>

        {/* Quick Utilities */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-[0.35em] text-foreground/60 mb-4">
            Quick utilities
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/streams/create" className="group">
              <Card className="glass-card card-hover h-full">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/10">
                    <Zap className="h-5 w-5 text-green" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white group-hover:text-green transition-colors">
                      New Stream
                    </p>
                    <p className="text-xs text-foreground/50">Start streaming</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/wallet" className="group">
              <Card className="glass-card card-hover h-full">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/10">
                    <Coins className="h-5 w-5 text-green" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white group-hover:text-green transition-colors">
                      Wallet
                    </p>
                    <p className="text-xs text-foreground/50">View balances</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/leaderboard" className="group">
              <Card className="glass-card card-hover h-full">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/10">
                    <Trophy className="h-5 w-5 text-green" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white group-hover:text-green transition-colors">
                      Leaderboard
                    </p>
                    <p className="text-xs text-foreground/50">View rankings</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/spend" className="group">
              <Card className="glass-card card-hover h-full">
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green/10">
                    <ShoppingBag className="h-5 w-5 text-green" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white group-hover:text-green transition-colors">
                      Spend
                    </p>
                    <p className="text-xs text-foreground/50">Use your G$</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
