"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Plus,
  Smartphone,
  Coins,
  Wallet,
  Zap,
  Trophy,
  User,
  Star,
  Vote,
  ExternalLink,
  Layers,
  ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TopUpModal } from "@/components/top-up-modal";
import { OffRampModal } from "@/components/off-ramp-modal";
import { SwapGdModal } from "@/components/swap-gd-modal";
import { UbiClaimCard } from "@/components/gooddollar/ubi-claim-card";
import { useDripV4Streams, StreamStatus, type DripV4Stream } from "@/lib/contracts/hooks/useDripV4";
import { getTokenAddressBySymbol, getTokenByAddress } from "@/lib/tokens/config";
import { formatTokenAmountWithDecimals } from "@/lib/utils/format";
import { isSupportedChain } from "@/lib/gooddollar/utils";

const FLOWSTATE_VOTE_URL =
  "https://flowstate.network/flow-councils/42220/0xfabef1abae4998146e8a8422813eb787caa26ec2";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeRemaining(endTime: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const end = Number(endTime);
  if (end <= now) return "Ended";
  const secs = end - now;
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

function StreamRow({ stream, chainId }: { stream: DripV4Stream; chainId: number }) {
  const tokenInfo = getTokenByAddress(stream.token as `0x${string}`, chainId);
  const symbol = tokenInfo?.symbol ?? "Token";
  const isSending = stream.userRole === "sender" || stream.userRole === "both";

  return (
    <Link href={`/streams/${stream.streamId.toString()}`} className="block">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/8">
        <div className="flex items-center gap-2.5 min-w-0">
          {isSending ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
          ) : (
            <ArrowDownLeft className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate leading-none">
              {stream.title || `Stream #${stream.streamId.toString()}`}
            </p>
            <p className="text-xs text-foreground/50 mt-0.5">
              {stream.recipients.length} recipient{stream.recipients.length !== 1 ? "s" : ""} · {symbol}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {stream.status === StreamStatus.Active && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              {timeRemaining(stream.endTime)}
            </span>
          )}
          {stream.status === StreamStatus.Paused && (
            <span className="text-xs text-orange-400 font-medium">Paused</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [showTopUp, setShowTopUp]   = useState(false);
  const [showOffRamp, setShowOffRamp] = useState(false);
  const [showSwap, setShowSwap]       = useState(false);

  const { streams: allStreams, analytics, isLoading: streamsLoading } = useDripV4Streams(address);

  const goodDollarAddress = getTokenAddressBySymbol("G$", chainId);
  const usdcAddress = getTokenAddressBySymbol("USDC", chainId);

  const { data: gdBalance, isLoading: gdLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    token: goodDollarAddress,
    query: { enabled: !!address && !!goodDollarAddress, refetchInterval: 30000, staleTime: 20_000 },
  });
  const { data: usdcBalance, isLoading: usdcLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    token: usdcAddress,
    query: { enabled: !!address && !!usdcAddress, refetchInterval: 30000, staleTime: 20_000 },
  });
  const { data: celoBalance, isLoading: celoLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address, refetchInterval: 30000, staleTime: 20_000 },
  });

  const gdFormatted   = gdBalance   ? formatTokenAmountWithDecimals(gdBalance.value,   gdBalance.decimals,   2) : "0.00";
  const usdcFormatted = usdcBalance ? formatTokenAmountWithDecimals(usdcBalance.value, usdcBalance.decimals, 2) : "0.00";
  const celoFormatted = celoBalance ? formatTokenAmountWithDecimals(celoBalance.value, celoBalance.decimals, 4) : "0.0000";

  const { activeSending, activeReceiving } = useMemo(() => {
    const sending: DripV4Stream[]   = [];
    const receiving: DripV4Stream[] = [];
    allStreams.forEach((s) => {
      const active = s.status === StreamStatus.Active || s.status === StreamStatus.Paused;
      if (!active) return;
      if (s.userRole === "sender" || s.userRole === "both") sending.push(s);
      if (s.userRole === "recipient" || s.userRole === "both") receiving.push(s);
    });
    return { activeSending: sending, activeReceiving: receiving };
  }, [allStreams]);

  const isGoodDollarChain = isSupportedChain(chainId);

  return (
    <main className="flex-1">
      {showTopUp && address && (
        <TopUpModal address={address} onClose={() => setShowTopUp(false)} />
      )}
      {showOffRamp && address && (
        <OffRampModal address={address} onClose={() => setShowOffRamp(false)} />
      )}
      {showSwap && address && (
        <SwapGdModal
          address={address}
          onClose={() => setShowSwap(false)}
          onSwapSuccess={() => { setShowSwap(false); setShowOffRamp(true); }}
        />
      )}

      <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">

        {/* ── Row 1: Greeting + CTAs ─────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.45em] text-foreground/50 mb-1">
              Dashboard
            </p>
            {isConnected && address ? (
              <>
                <h1 className="text-2xl font-bold text-white">
                  {greeting()},{" "}
                  <span className="font-mono text-green text-xl">
                    {address.slice(0, 6)}…{address.slice(-4)}
                  </span>
                </h1>
                <p className="text-sm text-foreground/60 mt-0.5">
                  {streamsLoading ? "Loading…" : `${analytics.activeStreams} active stream${analytics.activeStreams !== 1 ? "s" : ""}`}
                  {" · "}
                  {gdLoading ? "…" : `${gdFormatted} G$`}
                </p>
              </>
            ) : (
              <h1 className="text-2xl font-bold text-white">Welcome to Drip</h1>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button className="hero-cta-button" asChild>
              <Link href="/streams/create" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                New Stream
              </Link>
            </Button>
            {isConnected && address && (
              <Button variant="outline" className="hero-cta-outline flex items-center gap-2" onClick={() => setShowTopUp(true)}>
                <Smartphone className="h-4 w-4 text-green-500" />
                Top Up
              </Button>
            )}
            {isConnected && address && (
              <Button variant="outline" className="hero-cta-outline flex items-center gap-2" onClick={() => setShowOffRamp(true)}>
                <ArrowDownLeft className="h-4 w-4 text-orange-400" />
                Cash Out
              </Button>
            )}
            {isConnected && address && (
              <Button variant="outline" className="hero-cta-outline flex items-center gap-2" onClick={() => setShowSwap(true)}>
                <ArrowLeftRight className="h-4 w-4 text-purple-400" />
                Swap G$
              </Button>
            )}
          </div>
        </div>

        {/* ── Row 2: Balance cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="glass-card">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-1.5 text-xs text-foreground/55 mb-2">
                <Coins className="h-3.5 w-3.5 text-green" />
                G$ Balance
              </div>
              <p className="text-xl font-bold text-white tabular-nums">
                {gdLoading ? <span className="text-foreground/40">…</span> : gdFormatted}
              </p>
              <p className="text-xs text-foreground/40 mt-0.5">GoodDollar</p>
            </CardContent>
          </Card>

          <div className="cursor-pointer" onClick={() => isConnected && address && setShowOffRamp(true)}>
            <Card className="glass-card card-hover">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-1.5 text-xs text-foreground/55 mb-2">
                  <Coins className="h-3.5 w-3.5 text-blue-400" />
                  USDC Balance
                </div>
                <p className="text-xl font-bold text-white tabular-nums">
                  {usdcLoading ? <span className="text-foreground/40">…</span> : usdcFormatted}
                </p>
                <p className="text-xs text-foreground/40 mt-0.5">
                  {usdcBalance && Number(usdcBalance.value) === 0 ? "Top up to cash out →" : "Tap to cash out →"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-card">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-1.5 text-xs text-foreground/55 mb-2">
                  <Wallet className="h-3.5 w-3.5 text-yellow-400" />
                  CELO Balance
                </div>
                <p className="text-xl font-bold text-white tabular-nums">
                  {celoLoading ? <span className="text-foreground/40">…</span> : celoFormatted}
                </p>
                <p className="text-xs text-foreground/40 mt-0.5">Gas token</p>
              </CardContent>
            </Card>
        </div>

        {/* ── Row 3: Active streams snapshot ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Sending */}
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">Sending</span>
                {!streamsLoading && (
                  <span className="text-xs text-foreground/50">
                    ({activeSending.length})
                  </span>
                )}
              </div>
              <Link href="/streams" className="text-xs text-green hover:underline underline-offset-2">
                View all →
              </Link>
            </div>

            {streamsLoading ? (
              <div className="space-y-2">
                {[0,1,2].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : activeSending.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-foreground/50">No active outgoing streams</p>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/streams/create">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Create stream
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeSending.slice(0, 4).map((s) => (
                  <StreamRow key={s.streamId.toString()} stream={s} chainId={chainId} />
                ))}
                {activeSending.length > 4 && (
                  <Link href="/streams" className="block text-center text-xs text-foreground/50 hover:text-green pt-1">
                    +{activeSending.length - 4} more
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Receiving */}
          <div className="glass-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowDownLeft className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-semibold text-white">Receiving</span>
                {!streamsLoading && (
                  <span className="text-xs text-foreground/50">
                    ({activeReceiving.length})
                  </span>
                )}
              </div>
              <Link href="/streams" className="text-xs text-green hover:underline underline-offset-2">
                View all →
              </Link>
            </div>

            {streamsLoading ? (
              <div className="space-y-2">
                {[0,1,2].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : activeReceiving.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-foreground/50">No active incoming streams</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeReceiving.slice(0, 4).map((s) => (
                  <StreamRow key={s.streamId.toString()} stream={s} chainId={chainId} />
                ))}
                {activeReceiving.length > 4 && (
                  <Link href="/streams" className="block text-center text-xs text-foreground/50 hover:text-green pt-1">
                    +{activeReceiving.length - 4} more
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 4: UBI claim + Vote for Drip ───────────────────────────── */}
        {isGoodDollarChain && isConnected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <UbiClaimCard />
            </div>

            {/* Vote for Drip — slim card */}
            <Card className="glass-card border-green/25 flex flex-col justify-between">
              <CardContent className="pt-5 pb-5 space-y-3 flex flex-col h-full justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-green" />
                    <p className="text-sm font-semibold text-white">Vote for Drip</p>
                  </div>
                  <p className="text-xs text-foreground/60">
                    Support us in GoodDollar Builders Round 3. Your vote directs funding to keep Drip running.
                  </p>
                </div>
                <a
                  href={FLOWSTATE_VOTE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-green/15 hover:bg-green/25 border border-green/30 text-green text-sm font-medium py-2.5 transition-colors"
                >
                  <Vote className="h-4 w-4" />
                  Vote now
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Row 5: Quick nav strip ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-xs text-foreground/40 mr-1">Jump to:</span>
          {[
            { href: "/streams",        icon: Layers,     label: "Streams"     },
            { href: "/streams/create", icon: Zap,        label: "New Stream"  },
            { href: "/profile",        icon: User,       label: "Profile"     },
            { href: "/leaderboard",    icon: Trophy,     label: "Leaderboard" },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-foreground/60 hover:text-white hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          ))}
        </div>

      </div>
    </main>
  );
}
