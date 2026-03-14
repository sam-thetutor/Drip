"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import { formatEther } from "viem";
import {
  ArrowRight,
  Wallet,
  TrendingUp,
  Clock,
  Coins,
  Lock,
  Activity,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllUserStreams } from "@/lib/contracts";
import { useStaking } from "@/lib/contracts/hooks/useStaking";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";
import { formatTokenAmountWithDecimals } from "@/lib/utils/format";

export default function WalletPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { streams, isLoading: streamsLoading } = useAllUserStreams(
    address as `0x${string}` | undefined
  );
  const staking = useStaking();

  const goodDollarAddress = getTokenAddressBySymbol("G$", chainId);

  const { data: gdBalance, isLoading: gdLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    token: goodDollarAddress,
    query: {
      enabled: !!address && !!goodDollarAddress,
      refetchInterval: 30000,
      refetchOnWindowFocus: false,
      staleTime: 20 * 1000,
    },
  });

  const { data: celoBalance, isLoading: celoLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    query: {
      enabled: !!address,
      refetchInterval: 30000,
      refetchOnWindowFocus: false,
      staleTime: 20 * 1000,
    },
  });

  const activeStreams = useMemo(() => {
    if (!Array.isArray(streams)) return [];
    return streams.filter((stream: any) => Number(stream.status ?? 0) === 1);
  }, [streams]);

  const sentStreams = useMemo(() => {
    if (!Array.isArray(streams)) return [];
    return streams.filter(
      (s: any) => s.userRole === "sender" || s.userRole === "both"
    );
  }, [streams]);

  const receivedStreams = useMemo(() => {
    if (!Array.isArray(streams)) return [];
    return streams.filter(
      (s: any) => s.userRole === "recipient" || s.userRole === "both"
    );
  }, [streams]);

  const gdFormatted = gdBalance
    ? formatTokenAmountWithDecimals(
        gdBalance.value,
        gdBalance.decimals,
        2
      )
    : "0.00";

  const celoFormatted = celoBalance
    ? formatTokenAmountWithDecimals(
        celoBalance.value,
        celoBalance.decimals,
        4
      )
    : "0.0000";

  const streamStatusLabel = (status: number) => {
    switch (status) {
      case 1:
        return "Active";
      case 2:
        return "Paused";
      case 3:
        return "Cancelled";
      case 4:
        return "Completed";
      default:
        return "Unknown";
    }
  };

  const streamStatusColor = (status: number) => {
    switch (status) {
      case 1:
        return "text-green";
      case 2:
        return "text-yellow-400";
      case 3:
        return "text-red-400";
      case 4:
        return "text-foreground/60";
      default:
        return "text-foreground/60";
    }
  };

  if (!isConnected) {
    return (
      <main className="flex-1">
        <div className="container mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <Wallet className="h-12 w-12 text-foreground/40" />
            <h2 className="text-xl font-semibold text-white">
              Connect your wallet
            </h2>
            <p className="text-sm text-foreground/60">
              Connect your wallet to view balances and manage streams.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="container mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-foreground/60">
            Wallet
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            GoodDollar wallet
          </h1>
          <p className="text-sm text-foreground/70">
            Track balances, manage streams, and move funds.
          </p>
        </div>

        {/* Balance Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="glass-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-xs text-foreground/60 mb-2">
                <Coins className="h-3.5 w-3.5 text-green" />
                <span>G$ Available</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {gdLoading ? "..." : gdFormatted}
              </p>
              <p className="text-xs text-foreground/50 mt-1">GoodDollar</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-xs text-foreground/60 mb-2">
                <Wallet className="h-3.5 w-3.5 text-green" />
                <span>CELO Balance</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {celoLoading ? "..." : celoFormatted}
              </p>
              <p className="text-xs text-foreground/50 mt-1">CELO</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-xs text-foreground/60 mb-2">
                <TrendingUp className="h-3.5 w-3.5 text-green" />
                <span>Active Streams</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {streamsLoading ? "..." : activeStreams.length}
              </p>
              <p className="text-xs text-foreground/50 mt-1">Flowing now</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-2 text-xs text-foreground/60 mb-2">
                <Lock className="h-3.5 w-3.5 text-foreground/40" />
                <span>Staked</span>
              </div>
              <p className="text-2xl font-bold text-foreground/40">--</p>
              <p className="text-xs text-foreground/50 mt-1">Coming soon</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mb-8 flex flex-wrap gap-3">
          <Button className="hero-cta-button" asChild>
            <Link href="/streams/create" className="flex items-center gap-2">
              Create stream
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" className="hero-cta-outline" asChild>
            <Link href="/dashboard" className="flex items-center gap-2">
              Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="streams" className="w-full">
          <TabsList className="w-full grid grid-cols-3 bg-white/5 border border-white/10 rounded-xl mb-6">
            <TabsTrigger
              value="streams"
              className="data-[state=active]:bg-green/20 data-[state=active]:text-green rounded-lg"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Streams
            </TabsTrigger>
            <TabsTrigger
              value="stake"
              className="data-[state=active]:bg-green/20 data-[state=active]:text-green rounded-lg"
            >
              <Lock className="h-4 w-4 mr-2" />
              Stake
            </TabsTrigger>
            <TabsTrigger
              value="activity"
              className="data-[state=active]:bg-green/20 data-[state=active]:text-green rounded-lg"
            >
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Streams Tab */}
          <TabsContent value="streams" className="space-y-4">
            {streamsLoading ? (
              <Card className="glass-card">
                <CardContent className="py-8 text-center text-sm text-foreground/60">
                  Loading streams...
                </CardContent>
              </Card>
            ) : !Array.isArray(streams) || streams.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-10 w-10 mx-auto text-foreground/30 mb-3" />
                  <p className="text-sm text-foreground/60 mb-4">
                    No streams yet. Create your first stream to get started.
                  </p>
                  <Button className="hero-cta-button" asChild>
                    <Link href="/streams/create">Create stream</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Sent Streams */}
                {sentStreams.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground/70 mb-3">
                      Sending ({sentStreams.length})
                    </h3>
                    <div className="space-y-3">
                      {sentStreams.map((stream: any, idx: number) => (
                        <Card key={`sent-${idx}`} className="glass-card card-hover">
                          <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-mono text-foreground/60">
                                    Stream #{String(stream.streamId ?? idx)}
                                  </span>
                                  <span
                                    className={`text-xs font-medium ${streamStatusColor(
                                      Number(stream.status ?? 0)
                                    )}`}
                                  >
                                    {streamStatusLabel(Number(stream.status ?? 0))}
                                  </span>
                                </div>
                                <p className="text-sm text-white">
                                  {(stream.recipients?.length ?? 0)} recipient
                                  {(stream.recipients?.length ?? 0) !== 1 ? "s" : ""}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/streams/${stream.streamId ?? idx}`}
                                  className="text-green"
                                >
                                  View
                                  <ExternalLink className="h-3 w-3 ml-1" />
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Received Streams */}
                {receivedStreams.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground/70 mb-3">
                      Receiving ({receivedStreams.length})
                    </h3>
                    <div className="space-y-3">
                      {receivedStreams.map((stream: any, idx: number) => (
                        <Card key={`recv-${idx}`} className="glass-card card-hover">
                          <CardContent className="py-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-mono text-foreground/60">
                                    Stream #{String(stream.streamId ?? idx)}
                                  </span>
                                  <span
                                    className={`text-xs font-medium ${streamStatusColor(
                                      Number(stream.status ?? 0)
                                    )}`}
                                  >
                                    {streamStatusLabel(Number(stream.status ?? 0))}
                                  </span>
                                </div>
                                <p className="text-xs text-foreground/60 font-mono truncate">
                                  From:{" "}
                                  {stream.sender
                                    ? `${stream.sender.slice(0, 6)}...${stream.sender.slice(-4)}`
                                    : "Unknown"}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm" asChild>
                                <Link
                                  href={`/streams/${stream.streamId ?? idx}`}
                                  className="text-green"
                                >
                                  View
                                  <ExternalLink className="h-3 w-3 ml-1" />
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <Button variant="outline" className="w-full hero-cta-outline" asChild>
                    <Link href="/streams/create">View all streams</Link>
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Stake Tab */}
          <TabsContent value="stake">
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="grid gap-4 sm:grid-cols-2">
                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-foreground/50 mb-1">Your Staked</p>
                        <p className="text-2xl font-semibold text-white">
                          {formatEther(staking.stakedAmount)} G$
                        </p>
                        <p className="text-xs text-foreground/50 mt-1">
                          Pool Units: {staking.poolUnits.toString()}
                        </p>
                      </div>
                      <Lock className="h-8 w-8 text-green/50" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-card">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-foreground/50 mb-1">Current APY</p>
                        <p className="text-2xl font-semibold text-green">
                          {staking.apy.toFixed(2)}%
                        </p>
                        <p className="text-xs text-foreground/50 mt-1">
                          ~{formatEther(staking.rewardFlowRate * 86400n)} G$/day
                        </p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green/50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Claimable Rewards */}
              {staking.claimableRewards > 0n && (
                <Card className="glass-card border-green/30">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-foreground/50 mb-1">Claimable Rewards</p>
                        <p className="text-xl font-semibold text-green">
                          {formatEther(staking.claimableRewards)} G$
                        </p>
                      </div>
                      <Button
                        onClick={() => staking.claimRewards()}
                        disabled={staking.isClaimPending || staking.isClaimConfirming}
                        className="hero-cta-button"
                      >
                        {staking.isClaimPending
                          ? "Confirming..."
                          : staking.isClaimConfirming
                          ? "Processing..."
                          : "Claim"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* CTA to Full Stake Page */}
              <Card className="glass-card bg-gradient-to-br from-green/10 to-transparent border-green/30">
                <CardContent className="py-8 text-center">
                  <Lock className="h-12 w-12 mx-auto text-green mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Manage Your Stake
                  </h3>
                  <p className="text-sm text-foreground/60 max-w-md mx-auto mb-6">
                    Visit the full staking page to stake, unstake, view live earnings, and track pool statistics.
                  </p>
                  <Button className="hero-cta-button" asChild>
                    <Link href="/stake" className="flex items-center gap-2">
                      Go to Staking
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Pool Info Summary */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base">Pool Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-foreground/60">Total Staked</span>
                    <span className="text-sm font-semibold text-white">
                      {formatEther(staking.totalStaked)} G$
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-foreground/60">Your Pool Share</span>
                    <span className="text-sm font-semibold text-green">
                      {staking.totalStaked > 0n
                        ? ((Number(staking.stakedAmount) / Number(staking.totalStaked)) * 100).toFixed(2)
                        : "0.00"}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-5 w-5" />
                  Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="py-8 text-center">
                  <Clock className="h-12 w-12 mx-auto text-foreground/30 mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Activity Feed Coming Soon
                  </h3>
                  <p className="text-sm text-foreground/60 max-w-md mx-auto">
                    A full timeline of your transactions including UBI claims,
                    stream creates, withdrawals, and spend transactions.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
