"use client";

import { useState } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import { formatEther, parseEther } from "viem";
import { TrendingUp, Lock, Coins, ArrowUpRight, Star, Shield, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStakingV2 } from "@/lib/contracts/hooks/useStakingV2";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";

export default function StakePage() {
  const { address } = useAccount();
  const chainId = useChainId();
  const staking = useStakingV2();
  const [amount, setAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");

  const goodDollarAddress = getTokenAddressBySymbol("G$", chainId);
  const { data: gdBalance } = useBalance({
    address: address as `0x${string}` | undefined,
    token: goodDollarAddress,
    query: { enabled: !!address && !!goodDollarAddress },
  });

  const gdFormatted = gdBalance ? formatEther(gdBalance.value) : "0.00";

  const setPresetAmount = (percentage: number) => {
    if (activeTab === "stake" && gdBalance) {
      setAmount(formatEther((gdBalance.value * BigInt(percentage)) / 100n));
    } else if (activeTab === "unstake") {
      setAmount(formatEther((staking.stakedAmount * BigInt(percentage)) / 100n));
    }
  };

  const handleAction = () => {
    if (!amount) return;
    if (activeTab === "stake") {
      staking.stakeTokens(amount);
    } else {
      staking.unstakeTokens(amount);
    }
    setAmount("");
  };

  const poolSharePct =
    staking.totalStaked > 0n
      ? (Number(staking.stakedAmount) / Number(staking.totalStaked)) * 100
      : 0;

  const isProcessing =
    staking.isStakePending ||
    staking.isStakeConfirming ||
    staking.isUnstakePending ||
    staking.isUnstakeConfirming ||
    staking.isApprovePending;

  const needsApproval = staking.needsApproval(amount || "0");

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-green/5">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Hero — live points counter */}
        <div className="text-center mb-12 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-green/20 via-cyan/20 to-green/20 blur-3xl opacity-30 -z-10" />
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green/10 border border-green/20 mb-4">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-medium text-green">Live Points</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-bold mb-3 bg-gradient-to-r from-green via-cyan-400 to-green bg-clip-text text-transparent animate-gradient font-mono tabular-nums">
            {Number(staking.pointsDisplay).toLocaleString()}
          </h1>
          <p className="text-foreground/60 text-lg mb-1">Points earned so far</p>
          {staking.stakedAmount > 0n && (
            <p className="text-sm text-foreground/40">
              +{Math.floor(staking.pointsPerDay).toLocaleString()} pts / day at current stake
            </p>
          )}
        </div>

        {/* Main Content - Dual Panel */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Left Panel - Your Position */}
          <div className="space-y-4">
            <Card className="glass-card border-green/20 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green/5 to-transparent" />
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-green" />
                  Your Position
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="text-center py-6">
                  <p className="text-sm text-foreground/50 mb-2">Staked Balance</p>
                  <p className="text-4xl font-bold text-white mb-1">
                    {parseFloat(staking.stakedDisplay).toFixed(2)}
                  </p>
                  <p className="text-sm text-foreground/60">G$ Tokens</p>
                </div>

                <div className="relative w-48 h-48 mx-auto">
                  <svg className="transform -rotate-90 w-48 h-48">
                    <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="8" fill="none" className="text-white/5" />
                    <circle
                      cx="96" cy="96" r="88"
                      stroke="currentColor" strokeWidth="8" fill="none"
                      strokeDasharray={`${2 * Math.PI * 88}`}
                      strokeDashoffset={`${2 * Math.PI * 88 * (1 - poolSharePct / 100)}`}
                      className="text-green transition-all duration-1000"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-bold text-green">{poolSharePct.toFixed(2)}%</p>
                    <p className="text-xs text-foreground/50">Pool Share</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div className="text-center">
                    <p className="text-xs text-foreground/50 mb-1">Total Points</p>
                    <p className="text-lg font-semibold text-green font-mono tabular-nums">
                      {Number(staking.pointsDisplay).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-foreground/50 mb-1">Pts / Day</p>
                    <p className="text-lg font-semibold text-white">
                      {Math.floor(staking.pointsPerDay).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {staking.stakedAmount > 0n && (
              <Card className="glass-card border-green/30 bg-gradient-to-br from-green/10 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="h-5 w-5 text-green animate-pulse" />
                    <span className="text-sm font-medium text-foreground/70">Points Accruing</span>
                  </div>
                  <div className="text-center py-4">
                    <p className="text-3xl font-bold text-green font-mono tabular-nums">
                      {Number(staking.pointsDisplay).toLocaleString()}
                    </p>
                    <p className="text-xs text-foreground/50 mt-1">pts (updating live)</p>
                  </div>
                  <div className="text-xs text-center text-green pt-3 border-t border-green/20 flex items-center justify-center gap-1">
                    <span className="inline-block w-2 h-2 bg-green rounded-full animate-pulse" />
                    Points grow every second you stake
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Panel - Actions */}
          <div className="space-y-4">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-green" />
                  Manage Stake
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "stake" | "unstake")} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-white/5 mb-6">
                    <TabsTrigger 
                      value="stake"
                      className="data-[state=active]:bg-green/20 data-[state=active]:text-green"
                    >
                      <Lock className="h-4 w-4 mr-2" />
                      Stake
                    </TabsTrigger>
                    <TabsTrigger 
                      value="unstake"
                      className="data-[state=active]:bg-green/20 data-[state=active]:text-green"
                      disabled={staking.stakedAmount === 0n}
                    >
                      <ArrowUpRight className="h-4 w-4 mr-2" />
                      Unstake
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="stake" className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-foreground/70">
                          Amount to Stake
                        </label>
                        <span className="text-xs text-foreground/50">
                          Balance: {parseFloat(gdFormatted).toFixed(2)} G$
                        </span>
                      </div>
                      
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="h-14 text-2xl font-semibold bg-white/5 border-white/10 focus:border-green pr-16"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40 font-medium">
                          G$
                        </span>
                      </div>

                      {/* Preset Buttons */}
                      <div className="grid grid-cols-4 gap-2 pt-2">
                        {[25, 50, 75, 100].map((pct) => (
                          <Button
                            key={pct}
                            variant="outline"
                            size="sm"
                            onClick={() => setPresetAmount(pct)}
                            className="hero-cta-outline text-xs"
                          >
                            {pct === 100 ? "Max" : `${pct}%`}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={handleAction}
                      disabled={!amount || Number(amount) <= 0 || isProcessing}
                      className="w-full h-12 hero-cta-button text-lg font-semibold"
                    >
                      {staking.isApprovePending
                        ? "Approving..."
                        : staking.isApproveConfirming
                        ? "Approving... (staking next)"
                        : staking.isStakePending
                        ? "Confirm in wallet..."
                        : staking.isStakeConfirming
                        ? "Staking..."
                        : needsApproval
                        ? "Approve & Stake"
                        : "Stake Now"}
                    </Button>

                    <div className="p-4 rounded-lg bg-green/5 border border-green/20">
                      <p className="text-xs text-foreground/60 mb-2">💡 When you stake:</p>
                      <ul className="text-xs text-foreground/50 space-y-1 pl-4">
                        <li>• Points accrue every second proportional to your stake</li>
                        <li>• No lock period — unstake anytime</li>
                        <li>• Points power leaderboards and future reward tiers</li>
                      </ul>
                    </div>
                  </TabsContent>

                  <TabsContent value="unstake" className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-foreground/70">
                          Amount to Unstake
                        </label>
                        <span className="text-xs text-foreground/50">
                          Staked: {parseFloat(staking.stakedDisplay).toFixed(2)} G$
                        </span>
                      </div>
                      
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="h-14 text-2xl font-semibold bg-white/5 border-white/10 focus:border-green pr-16"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-foreground/40 font-medium">
                          G$
                        </span>
                      </div>

                      {/* Preset Buttons */}
                      <div className="grid grid-cols-4 gap-2 pt-2">
                        {[25, 50, 75, 100].map((pct) => (
                          <Button
                            key={pct}
                            variant="outline"
                            size="sm"
                            onClick={() => setPresetAmount(pct)}
                            className="hero-cta-outline text-xs"
                          >
                            {pct === 100 ? "Max" : `${pct}%`}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={handleAction}
                      disabled={
                        !amount ||
                        Number(amount) <= 0 ||
                        isProcessing
                      }
                      className="w-full h-12 hero-cta-button text-lg font-semibold"
                    >
                      {staking.isUnstakePending
                        ? "Confirming..."
                        : staking.isUnstakeConfirming
                        ? "Processing..."
                        : "Unstake"}
                    </Button>

                    {/* Info Box */}
                    <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
                      <p className="text-xs text-foreground/60 mb-2">
                        ⚠️ When you unstake:
                      </p>
                      <ul className="text-xs text-foreground/50 space-y-1 pl-4">
                        <li>• Points stop accruing on the withdrawn amount</li>
                        <li>• Already-earned points are permanently saved</li>
                        <li>• Your pool share decreases</li>
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Global Stats */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-5 w-5 text-green" />
                  Global Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-white/10">
                  <span className="text-sm text-foreground/60">Total Staked</span>
                  <span className="text-sm font-semibold text-white">
                    {parseFloat(staking.totalStakedDisplay).toFixed(2)} G$
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-white/10">
                  <span className="text-sm text-foreground/60">Total Points Issued</span>
                  <span className="text-sm font-semibold text-green font-mono">
                    {Number(staking.totalPointsIssued).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground/60">Your Pool Share</span>
                  <span className="text-lg font-bold text-green">
                    {poolSharePct.toFixed(2)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer banner */}
        <Card className="glass-card border-cyan-400/20 bg-gradient-to-r from-cyan-500/5 to-green/5">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green/20 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Points-Based Staking</h3>
                  <p className="text-sm text-foreground/60">
                    Stake G$ to earn points · Points = leaderboard rank · More tiers coming
                  </p>
                </div>
              </div>
              <Button variant="outline" className="hero-cta-outline" asChild>
                <a href="/leaderboard" className="flex items-center gap-2">
                  Leaderboard
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <style jsx global>{`
        @keyframes gradient {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        .animate-gradient {
          background-size: 200% 200%;
          animation: gradient 3s ease infinite;
        }
      `}</style>
    </main>
  );
}
