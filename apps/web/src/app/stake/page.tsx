"use client";

import { useState, useEffect } from "react";
import { useAccount, useBalance, useChainId } from "wagmi";
import { formatEther, parseEther } from "viem";
import { TrendingUp, Lock, Coins, ArrowUpRight, Zap, Shield, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaking } from "@/lib/contracts/hooks/useStaking";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";

export default function StakePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const staking = useStaking();
  const [amount, setAmount] = useState("");
  const [activeTab, setActiveTab] = useState<"stake" | "unstake">("stake");

  const goodDollarAddress = getTokenAddressBySymbol("G$", chainId);
  const { data: gdBalance } = useBalance({
    address: address as `0x${string}` | undefined,
    token: goodDollarAddress,
    query: {
      enabled: !!address && !!goodDollarAddress,
    },
  });

  const gdFormatted = gdBalance
    ? formatEther(gdBalance.value)
    : "0.00";

  const setPresetAmount = (percentage: number) => {
    if (activeTab === "stake" && gdBalance) {
      const preset = (gdBalance.value * BigInt(percentage)) / 100n;
      setAmount(formatEther(preset));
    } else if (activeTab === "unstake") {
      const preset = (staking.stakedAmount * BigInt(percentage)) / 100n;
      setAmount(formatEther(preset));
    }
  };

  const handleAction = () => {
    if (!amount) return;
    if (activeTab === "stake") {
      staking.stake(amount);
    } else {
      staking.unstake(amount);
    }
    setAmount("");
  };

  const poolSharePercentage = (staking.totalStaked as bigint) > 0n
    ? (Number(staking.stakedAmount) / Number(staking.totalStaked as bigint)) * 100
    : 0;

  const isProcessing = 
    staking.isStakePending || 
    staking.isStakeConfirming || 
    staking.isUnstakePending || 
    staking.isUnstakeConfirming ||
    staking.isApprovePending;

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-background to-green/5">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Hero Section */}
        <div className="text-center mb-12 relative">
          <div className="absolute inset-0 bg-gradient-to-r from-green/20 via-cyan/20 to-green/20 blur-3xl opacity-30 -z-10" />
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green/10 border border-green/20 mb-4">
            <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
            <span className="text-xs font-medium text-green">Live Staking</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-green via-cyan-400 to-green bg-clip-text text-transparent animate-gradient">
            {staking.apy.toFixed(2)}% APY
          </h1>
          
          <p className="text-foreground/60 text-lg mb-2">
            Stake G$ tokens and earn continuous rewards
          </p>
          <p className="text-sm text-foreground/40">
            Powered by Superfluid • Real-time streaming rewards
          </p>
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
                {/* Staked Amount */}
                <div className="text-center py-6">
                  <p className="text-sm text-foreground/50 mb-2">Staked Balance</p>
                  <p className="text-4xl font-bold text-white mb-1">
                    {parseFloat(formatEther(staking.stakedAmount)).toFixed(4)}
                  </p>
                  <p className="text-sm text-foreground/60">G$ Tokens</p>
                </div>

                {/* Pool Share Circle */}
                <div className="relative w-48 h-48 mx-auto">
                  <svg className="transform -rotate-90 w-48 h-48">
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      className="text-white/5"
                    />
                    <circle
                      cx="96"
                      cy="96"
                      r="88"
                      stroke="currentColor"
                      strokeWidth="8"
                      fill="none"
                      strokeDasharray={`${2 * Math.PI * 88}`}
                      strokeDashoffset={`${2 * Math.PI * 88 * (1 - poolSharePercentage / 100)}`}
                      className="text-green transition-all duration-1000"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-3xl font-bold text-green">
                      {poolSharePercentage.toFixed(2)}%
                    </p>
                    <p className="text-xs text-foreground/50">Pool Share</p>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
                  <div className="text-center">
                    <p className="text-xs text-foreground/50 mb-1">Pool Units</p>
                    <p className="text-lg font-semibold text-white">
                      {staking.poolUnits.toString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-foreground/50 mb-1">Claimed</p>
                    <p className="text-lg font-semibold text-white">
                      {parseFloat(formatEther(staking.claimedAmount)).toFixed(4)} G$
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Live Earnings Card */}
            {staking.stakedAmount > 0n && (
              <Card className="glass-card border-green/30 bg-gradient-to-br from-green/10 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Zap className="h-5 w-5 text-green animate-pulse" />
                      <span className="text-sm font-medium text-foreground/70">
                        {staking.isConnected ? "Streaming to Wallet" : "Claimable Rewards"}
                      </span>
                    </div>
                    {!staking.isConnected && staking.claimableRewards > 0n && (
                      <Button
                        onClick={() => staking.claimRewards()}
                        disabled={staking.isClaimPending || staking.isClaimConfirming}
                        size="sm"
                        className="bg-green hover:bg-green/90 text-black font-semibold shadow-lg shadow-green/20"
                      >
                        {staking.isClaimPending || staking.isClaimConfirming
                          ? "Claiming..."
                          : "Claim"}
                      </Button>
                    )}
                    {!staking.isConnected && staking.claimableRewards === 0n && (
                      <Button
                        onClick={() => staking.connectToPool()}
                        disabled={staking.isConnectPending || staking.isConnectConfirming}
                        size="sm"
                        className="bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                      >
                        {staking.isConnectPending || staking.isConnectConfirming
                          ? "Connecting..."
                          : "Connect"}
                      </Button>
                    )}
                  </div>
                  <div className="text-center py-4">
                    <p className="text-3xl font-bold text-green font-mono tabular-nums">
                      {parseFloat(formatEther(staking.claimableRewards)).toFixed(6)}
                    </p>
                    <p className="text-xs text-foreground/50 mt-1">
                      {staking.isConnected ? "G$ Streaming Real-Time ✨" : "G$ Ready to Claim"}
                    </p>
                  </div>
                  {staking.isConnected ? (
                    <div className="text-xs text-center text-green pt-3 border-t border-green/20 flex items-center justify-center gap-1">
                      <span className="inline-block w-2 h-2 bg-green rounded-full animate-pulse"></span>
                      Rewards flowing directly to your balance
                    </div>
                  ) : (
                    <div className="text-xs text-center text-foreground/40 pt-3 border-t border-green/20">
                      +{parseFloat(formatEther((staking.rewardRate as bigint) * 86400n)).toFixed(4)} G$ per day
                      <Button
                        onClick={() => staking.connectToPool()}
                        disabled={staking.isConnectPending || staking.isConnectConfirming}
                        variant="link"
                        size="sm"
                        className="text-blue-400 hover:text-blue-300 h-auto p-0 ml-2"
                      >
                        Enable auto-streaming →
                      </Button>
                    </div>
                  )}
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
                      disabled={
                        !amount ||
                        Number(amount) <= 0 ||
                        isProcessing
                      }
                      className="w-full h-12 hero-cta-button text-lg font-semibold"
                    >
                      {staking.isApprovePending
                        ? "Approving..."
                        : staking.isStakePending
                        ? "Confirming..."
                        : staking.isStakeConfirming
                        ? "Processing..."
                        : staking.allowance < parseEther(amount || "0")
                        ? "Approve G$"
                        : "Stake Now"}
                    </Button>

                    {/* Info Box */}
                    <div className="p-4 rounded-lg bg-green/5 border border-green/20">
                      <p className="text-xs text-foreground/60 mb-2">
                        💡 When you stake:
                      </p>
                      <ul className="text-xs text-foreground/50 space-y-1 pl-4">
                        <li>• Rewards stream continuously in real-time</li>
                        <li>• No lock period - unstake anytime</li>
                        <li>• Claim your rewards whenever you want</li>
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
                          Staked: {formatEther(staking.stakedAmount)} G$
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
                        <li>• Your rewards stop accumulating</li>
                        <li>• Pool share decreases</li>
                        <li>• Remember to claim pending rewards first!</li>
                      </ul>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Pool Statistics */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-5 w-5 text-green" />
                  Pool Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-white/10">
                  <span className="text-sm text-foreground/60">Total Staked</span>
                  <span className="text-sm font-semibold text-white">
                    {parseFloat(formatEther(staking.totalStaked as bigint)).toFixed(2)} G$
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-white/10">
                  <span className="text-sm text-foreground/60">Daily Rewards</span>
                  <span className="text-sm font-semibold text-green">
                    {formatEther((staking.rewardFlowRate as bigint) * 86400n)} G$
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-white/10">
                  <span className="text-sm text-foreground/60">Flow Rate</span>
                  <span className="text-sm font-semibold text-white font-mono">
                    {parseFloat(formatEther(staking.rewardFlowRate as bigint)).toFixed(10)} G$/sec
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-foreground/60">Current APY</span>
                  <span className="text-lg font-bold text-green">
                    {staking.apy.toFixed(2)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom Info Banner */}
        <Card className="glass-card border-cyan-400/20 bg-gradient-to-r from-cyan-500/5 to-green/5">
          <CardContent className="py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-green/20 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Powered by Superfluid</h3>
                  <p className="text-sm text-foreground/60">
                    Real-time money streaming protocol on Celo
                  </p>
                </div>
              </div>
              <Button variant="outline" className="hero-cta-outline" asChild>
                <a 
                  href="https://www.superfluid.finance/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2"
                >
                  Learn More
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
