"use client";

import { useAccount, useChainId, useReadContracts } from "wagmi";
import { useAutoRefreshStreamData, useSuperfluidClaim, useDrip } from "@/lib/contracts";
import { usePoolConnection } from "@/lib/contracts/hooks/useSuperfluid";
import { SUPERFLUID_GDA_ABI } from "@/lib/contracts/superfluid.abi";
import { getContractAddress } from "@/lib/contracts/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AddRecipientModal } from "@/components/add-recipient-modal";
import {
  Download, Loader2, ArrowUpRight, Copy, Check, Clock, Users,
  Activity, TrendingUp, Zap, Wifi, Pause, Play, X, Plus, Coins,
} from "lucide-react";
import { formatEther } from "viem";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

interface SuperfluidStreamDetailsViewProps {
  streamId: bigint;
}

export function SuperfluidStreamDetailsView({ streamId }: SuperfluidStreamDetailsViewProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId, "DripCoreSuperfluid");
  const { streamData, isLoading, refetch } = useAutoRefreshStreamData(streamId, address);
  const { claim, isPending, isConfirming, isConfirmed, error } = useSuperfluidClaim();
  const { pauseStream, resumeStream, cancelStream, isPending: isDripPending, isConfirming: isDripConfirming } = useDrip();
  const {
    isConnected,
    connectToPool,
    isPending: isConnectPending,
    isConfirming: isConnectConfirming,
    isConfirmed: isConnectConfirmed,
    error: connectError,
  } = usePoolConnection(streamId, address);
  const [showAddRecipient, setShowAddRecipient] = useState(false);

  const recipientInfoContracts = useMemo(() => {
    if (!contractAddress || !streamData?.recipients?.length) return [];

    return streamData.recipients.map((recipient) => ({
      address: contractAddress,
      abi: SUPERFLUID_GDA_ABI,
      functionName: "getRecipientInfo" as const,
      args: [streamId, recipient] as const,
    }));
  }, [contractAddress, streamData?.recipients, streamId]);

  const { data: recipientInfoResults } = useReadContracts({
    contracts: recipientInfoContracts,
    query: {
      enabled: recipientInfoContracts.length > 0,
    },
  });

  const recipientRateByAddress = useMemo(() => {
    const rates = new Map<string, bigint>();
    if (!streamData?.recipients || !recipientInfoResults) return rates;

    streamData.recipients.forEach((recipient, index) => {
      const result = recipientInfoResults[index];
      if (result?.status !== "success") return;

      const info = result.result as {
        recipient: string;
        ratePerSecond: bigint;
        totalWithdrawn: bigint;
        lastWithdrawTime: bigint;
        currentAccrued: bigint;
      };

      rates.set(recipient.toLowerCase(), info.ratePerSecond);
    });

    return rates;
  }, [recipientInfoResults, streamData?.recipients]);

  const isUserSender =
    address && streamData?.sender.toLowerCase() === address.toLowerCase();

  const isUserRecipient = address && streamData?.recipients.some(
    (r: string) => r.toLowerCase() === address.toLowerCase()
  );

  const statusText = ["Pending", "Active", "Paused", "Cancelled", "Completed"];
  const statusColors = {
    0: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    1: "bg-green-500/10 text-green-500 border-green-500/30",
    2: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    3: "bg-red-500/10 text-red-500 border-red-500/30",
    4: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  };

  const calculations = useMemo(() => {
    if (!streamData?.startTime || !streamData?.endTime) return null;

    const now = BigInt(Math.floor(Date.now() / 1000));
    const totalDuration = Number(streamData.endTime - streamData.startTime);
    const timeRemainingSeconds = streamData.endTime > now ? Number(streamData.endTime - now) : 0;
    const timeElapsedSeconds = now > streamData.startTime ? Number(now - streamData.startTime) : 0;
    const progress = totalDuration > 0
      ? Math.min(100, Math.max(0, (timeElapsedSeconds / totalDuration) * 100))
      : 0;

    // Flow rate calcs (only available when recipientInfo is present)
    const ri = streamData.recipientInfo;
    const flowRatePerHour = ri ? ri.ratePerSecond * 3600n : null;
    const flowRatePerDay  = ri ? ri.ratePerSecond * 86400n : null;

    return {
      totalDuration,
      timeRemainingSeconds,
      timeElapsedSeconds,
      progress,
      flowRatePerHour,
      flowRatePerDay,
    };
  }, [streamData]);

  // ─── Real-time streaming counter ─────────────────────────────────────────
  const [realtimeClaimable, setRealtimeClaimable] = useState<bigint>(0n);

  useEffect(() => {
    const rate = streamData?.recipientInfo?.ratePerSecond ?? 0n;
    const base = streamData?.claimableNow ?? 0n;
    const isActive = streamData?.status === 1;

    setRealtimeClaimable(base);

    if (!isActive || rate === 0n) return;

    const snapshot = Date.now();
    const endMs = Number(streamData!.endTime) * 1000;

    const interval = setInterval(() => {
      const now = Date.now();
      const cappedNow = Math.min(now, endMs);
      const elapsedSecs = BigInt(Math.max(0, Math.floor((cappedNow - snapshot) / 1000)));
      setRealtimeClaimable(base + rate * elapsedSecs);
    }, 1000);

    return () => clearInterval(interval);
  }, [streamData]);
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isConfirmed) {
      toast.success("Successfully claimed tokens!");
      refetch();
    }
    if (error) {
      toast.error(`Failed to claim: ${error.message}`);
    }
  }, [isConfirmed, error, refetch]);

  useEffect(() => {
    if (isConnectConfirmed) {
      toast.success("Connected! Tokens will now stream directly to your wallet.");
    }
    if (connectError) {
      toast.error(`Failed to connect: ${connectError.message}`);
    }
  }, [isConnectConfirmed, connectError]);

  const handleClaim = () => {
    if (!streamData || !address) return;
    claim(streamData.streamId, address);
    toast.info("Claiming tokens...");
  };

  const handleConnect = () => {
    connectToPool();
    toast.info("Connecting to pool...");
  };

  const handlePause = async () => {
    try {
      toast.loading("Submitting transaction...", { id: "pause-stream" });
      await pauseStream(streamId);
      toast.success("Stream paused!", { id: "pause-stream" });
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to pause", { id: "pause-stream" });
    }
  };

  const handleResume = async () => {
    try {
      toast.loading("Submitting transaction...", { id: "resume-stream" });
      await resumeStream(streamId);
      toast.success("Stream resumed!", { id: "resume-stream" });
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to resume", { id: "resume-stream" });
    }
  };

  const handleCancel = async () => {
    if (!confirm("End this stream? All accrued funds will be sent to recipients and any remaining deposit refunded to you.")) return;
    try {
      toast.loading("Submitting transaction...", { id: "cancel-stream" });
      await cancelStream(streamId);
      toast.success("Stream ended successfully!", { id: "cancel-stream" });
      refetch();
    } catch (e: any) {
      toast.error(e?.message || "Failed to end stream", { id: "cancel-stream" });
    }
  };

  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const copyAddr = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddr(addr);
    setTimeout(() => setCopiedAddr(null), 2000);
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatTime = (timestamp: bigint) => {
    return new Date(Number(timestamp) * 1000).toLocaleString();
  };

  const formatDuration = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading stream details...</span>
      </div>
    );
  }

  if (!streamData) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <p className="text-destructive">Stream not found</p>
            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline">
                <Link href="/streams">View All Streams</Link>
              </Button>
              <Button asChild>
                <Link href="/streams/create">Create New Stream</Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 w-full">

      {/* ── Hero card ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl glass-card">
        {streamData.status === 1 && (
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary/6 blur-3xl pointer-events-none" />
        )}

        <div className="relative p-6">
          {/* Top row: badges + role pill */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-md border border-border/40">
                #{streamData.streamId.toString()}
              </span>
              <span className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                statusColors[streamData.status as keyof typeof statusColors]
              }`}>
                {statusText[streamData.status]}
              </span>
              {isUserRecipient && isConnected && streamData.status === 1 && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                  Streaming Live
                </span>
              )}
            </div>
            {isUserSender && (
              <span className="text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-md">
                You own this stream
              </span>
            )}
            {isUserRecipient && !isUserSender && (
              <span className="text-xs font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-md">
                You receive this stream
              </span>
            )}
          </div>

          {/* Title + sender */}
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-1">
            {streamData.title || `Stream #${streamData.streamId}`}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <span>From</span>
            <button
              onClick={() => copyAddr(streamData.sender)}
              className="appearance-none bg-transparent border border-border/40 hover:border-border/70 px-2.5 py-1 rounded-md m-0 flex items-center gap-1.5 font-mono text-xl text-foreground/85 hover:text-foreground transition-all"
            >
              {formatAddress(streamData.sender)}
              {isUserSender && <span className="text-xs text-foreground/70 font-sans ml-0.5">(you)</span>}
              {copiedAddr === streamData.sender
                ? <Check className="h-3 w-3 text-foreground/70" />
                : <Copy className="h-3 w-3 opacity-40" />}
            </button>
            <button
              className="appearance-none bg-transparent border-0 p-0 m-0 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => window.open(`https://celoscan.io/address/${streamData.sender}`, '_blank')}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Progress timeline */}
        <div className="px-6 pb-5">
          <div className="h-1.5 w-full bg-muted/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50 transition-all duration-700"
              style={{ width: `${calculations?.progress ?? 0}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{formatTime(streamData.startTime)}</span>
            </div>
            <span className="font-medium text-foreground/60">
              {calculations
                ? calculations.timeRemainingSeconds > 0
                  ? `${formatDuration(calculations.timeRemainingSeconds)} remaining`
                  : "Stream ended"
                : ""}
            </span>
            <span>{formatTime(streamData.endTime)}</span>
          </div>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            Icon: Coins,
            label: "Deposit",
            value: `${parseFloat(formatEther(streamData.deposit)).toFixed(2)} G$`,
          },
          {
            Icon: Clock,
            label: "Duration",
            value: calculations ? formatDuration(calculations.totalDuration) : "—",
          },
          {
            Icon: Users,
            label: "Recipients",
            value: streamData.recipients.length.toString(),
          },
          {
            Icon: Activity,
            label: "Progress",
            value: calculations ? `${calculations.progress.toFixed(1)}%` : "—",
          },
        ].map(({ Icon, label, value }) => (
          <div key={label} className="rounded-xl glass-card p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-lg font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Sender controls ───────────────────────────────────────── */}
      {isUserSender && (streamData.status === 1 || streamData.status === 2) && (
        <div className="flex flex-wrap gap-2 p-4 rounded-xl glass-card">
          {streamData.status === 1 ? (
            <Button variant="outline" size="sm" onClick={handlePause} disabled={isDripPending || isDripConfirming}>
              {isDripPending || isDripConfirming
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Pause className="h-4 w-4 mr-2" />}
              Pause
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleResume} disabled={isDripPending || isDripConfirming}>
              {isDripPending || isDripConfirming
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Play className="h-4 w-4 mr-2" />}
              Resume
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setShowAddRecipient(true)} disabled={isDripPending || isDripConfirming}>
            <Plus className="h-4 w-4 mr-2" />
            Add Recipient
          </Button>
          <Button variant="destructive" size="sm" onClick={handleCancel} disabled={isDripPending || isDripConfirming}>
            <X className="h-4 w-4 mr-2" />
            End Stream
          </Button>
        </div>
      )}



      {/* ── Live earnings card (recipient only) ───────────────────── */}
      {streamData.recipientInfo && isUserRecipient && (
        <div className={`relative overflow-hidden rounded-2xl glass-card p-6 ${
          streamData.status === 1
            ? "border-green-500/40"
            : ""
        }`}>
          {streamData.status === 1 && (
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-green-500/8 blur-3xl pointer-events-none" />
          )}
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              {streamData.status === 1 && (
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-50" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                </span>
              )}
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                {isConnected ? "Streaming to wallet" : "Earned so far"}
              </p>
            </div>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold tabular-nums tracking-tight bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
                  {parseFloat(formatEther(realtimeClaimable)).toFixed(4)}
                </span>
                <span className="text-xl text-muted-foreground font-light">G$</span>
              </div>
              <div className="flex gap-3">
                {calculations?.flowRatePerHour != null && (
                  <div className="flex flex-col items-center rounded-xl border border-border/40 bg-muted/10 px-4 py-2.5 min-w-[88px]">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <Activity className="h-3 w-3" />
                      <span>/ hour</span>
                    </div>
                    <p className="text-base font-bold tabular-nums">
                      {parseFloat(formatEther(calculations.flowRatePerHour)).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground">G$</p>
                  </div>
                )}
                {calculations?.flowRatePerDay != null && (
                  <div className="flex flex-col items-center rounded-xl border border-border/40 bg-muted/10 px-4 py-2.5 min-w-[88px]">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                      <TrendingUp className="h-3 w-3" />
                      <span>/ day</span>
                    </div>
                    <p className="text-base font-bold tabular-nums">
                      {parseFloat(formatEther(calculations.flowRatePerDay)).toFixed(0)}
                    </p>
                    <p className="text-xs text-muted-foreground">G$</p>
                  </div>
                )}
              </div>
            </div>

            {isUserRecipient && !isConnected && streamData.status === 1 && (
              <Button
                className="w-full mt-5 h-11 font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 border-0 text-black"
                onClick={handleConnect}
                disabled={isConnectPending || isConnectConfirming}
              >
                {isConnectPending || isConnectConfirming
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Activating...</>
                  : <><Zap className="mr-2 h-4 w-4" />Activate</>}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Recipients ────────────────────────────────────────────── */}
      {isUserSender && <div className="rounded-2xl glass-card p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              Recipients
              <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                ({streamData.recipients.length})
              </span>
            </h3>
          </div>
          {(streamData.status === 1 || streamData.status === 2) && (
            <Button size="sm" variant="outline" onClick={() => setShowAddRecipient(true)} disabled={isDripPending || isDripConfirming}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          )}
        </div>

        {streamData.recipients.map((recipient: string, index: number) => {
          const isMe = !!(address && recipient.toLowerCase() === address.toLowerCase());
          const isReceiving = isConnected && isMe;

          return (
            <div
              key={index}
              className="flex items-center justify-between rounded-xl px-4 py-3 border border-border/40 bg-muted/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border flex-shrink-0 bg-muted/30 border-border/40 text-muted-foreground">
                  {index + 1}
                </div>
                <div>
                  <button
                    onClick={() => copyAddr(recipient)}
                    className="appearance-none bg-transparent border-0 p-0 m-0 flex items-center gap-1.5 font-mono text-xl hover:text-foreground/80 transition-colors"
                  >
                    {formatAddress(recipient)}
                    {copiedAddr === recipient
                      ? <Check className="h-3 w-3 text-foreground/70" />
                      : <Copy className="h-3 w-3 opacity-40" />}
                  </button>
                  <p className="text-sm text-muted-foreground mt-1">
                    Rate: {parseFloat(formatEther(recipientRateByAddress.get(recipient.toLowerCase()) ?? 0n)).toFixed(6)} G$/sec
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isMe && <span className="text-xs text-foreground/70 font-medium">You</span>}
                    {isReceiving && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Wifi className="h-3 w-3 animate-pulse" />
                        Receiving
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                className="appearance-none bg-transparent border-0 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted/30"
                onClick={() => window.open(`https://celoscan.io/address/${recipient}`, "_blank")}
              >
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>}

      {/* Add Recipient Modal */}
      {showAddRecipient && streamData && (
        <AddRecipientModal
          streamId={BigInt(streamData.streamId)}
          token={streamData.token as `0x${string}`}
          periodSeconds={Number(streamData.endTime - streamData.startTime)}
          onClose={() => setShowAddRecipient(false)}
          onSuccess={() => {
            setShowAddRecipient(false);
            refetch();
          }}
        />
      )}

    </div>
  );
}
