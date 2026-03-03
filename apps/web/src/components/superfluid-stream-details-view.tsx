"use client";

import { useAccount, useChainId } from "wagmi";
import { useAutoRefreshStreamData, useSuperfluidClaim } from "@/lib/contracts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2, ExternalLink, Clock, TrendingUp, Droplets, Users } from "lucide-react";
import { formatEther } from "viem";
import { toast } from "sonner";
import { useEffect, useMemo } from "react";
import Link from "next/link";

interface SuperfluidStreamDetailsViewProps {
  streamId: bigint;
}

export function SuperfluidStreamDetailsView({ streamId }: SuperfluidStreamDetailsViewProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { streamData, isLoading, refetch } = useAutoRefreshStreamData(streamId, address);
  const { claim, isPending, isConfirming, isConfirmed, error } = useSuperfluidClaim();

  const statusText = ["Pending", "Active", "Paused", "Cancelled", "Completed"];
  const statusColors = {
    0: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
    1: "bg-green-500/10 text-green-500 border-green-500/30",
    2: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    3: "bg-red-500/10 text-red-500 border-red-500/30",
    4: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  };

  const calculations = useMemo(() => {
    if (!streamData?.recipientInfo) return null;

    const flowRatePerSecond = streamData.recipientInfo.ratePerSecond;
    const flowRatePerHour = flowRatePerSecond * 3600n;
    const flowRatePerDay = flowRatePerSecond * 86400n;
    const flowRatePerWeek = flowRatePerSecond * 604800n;

    const now = BigInt(Math.floor(Date.now() / 1000));
    const timeRemainingSeconds = streamData.endTime > now ? Number(streamData.endTime - now) : 0;
    const timeElapsedSeconds = now > streamData.startTime ? Number(now - streamData.startTime) : 0;
    
    const projectedTotal = 
      streamData.recipientInfo.totalWithdrawn + 
      streamData.claimableNow + 
      (flowRatePerSecond * BigInt(timeRemainingSeconds));

    const progress = streamData.endTime > streamData.startTime
      ? ((Number(now - streamData.startTime) / Number(streamData.endTime - streamData.startTime)) * 100)
      : 0;

    return {
      flowRatePerSecond,
      flowRatePerHour,
      flowRatePerDay,
      flowRatePerWeek,
      timeRemainingSeconds,
      timeElapsedSeconds,
      projectedTotal,
      progress: Math.min(progress, 100),
    };
  }, [streamData]);

  useEffect(() => {
    if (isConfirmed) {
      toast.success("Successfully claimed tokens!");
      refetch();
    }
    if (error) {
      toast.error(`Failed to claim: ${error.message}`);
    }
  }, [isConfirmed, error, refetch]);

  const handleClaim = () => {
    if (!streamData) return;
    claim(streamData.streamId);
    toast.info("Claiming tokens...");
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

  const isUserSender = address && streamData.sender.toLowerCase() === address.toLowerCase();
  const isUserRecipient = address && streamData.recipients.some(
    (r: string) => r.toLowerCase() === address.toLowerCase()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Droplets className="h-8 w-8 text-primary" />
                <CardTitle className="text-3xl">{streamData.title || `Stream #${streamData.streamId}`}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                Superfluid GDA Pool Stream #{streamData.streamId.toString()}
              </p>
            </div>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium border-2 ${
                statusColors[streamData.status as keyof typeof statusColors]
              }`}
            >
              {statusText[streamData.status]}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Time Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card border border-border/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                  Started
                </p>
              </div>
              <p className="text-lg font-bold">
                {formatTime(streamData.startTime)}
              </p>
              {calculations && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDuration(calculations.timeElapsedSeconds)} ago
                </p>
              )}
            </div>

            <div className="glass-card border border-border/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                  Ends
                </p>
              </div>
              <p className="text-lg font-bold">
                {formatTime(streamData.endTime)}
              </p>
              {calculations && (
                <p className="text-xs text-muted-foreground mt-1">
                  {calculations.timeRemainingSeconds > 0 
                    ? `${formatDuration(calculations.timeRemainingSeconds)} remaining`
                    : 'Stream ended'
                  }
                </p>
              )}
            </div>

            <div className="glass-card border border-border/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                  Progress
                </p>
              </div>
              <p className="text-lg font-bold">
                {calculations ? `${calculations.progress.toFixed(1)}%` : '0%'}
              </p>
              <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
                  style={{ width: `${calculations?.progress || 0}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Flow Rate Metrics */}
      {calculations && streamData.recipientInfo && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Flow Rate Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Per Second
                </p>
                <p className="text-2xl font-bold">
                  {parseFloat(formatEther(calculations.flowRatePerSecond)).toFixed(8)}
                </p>
                <p className="text-xs text-muted-foreground">G$/sec</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Per Hour
                </p>
                <p className="text-2xl font-bold">
                  {parseFloat(formatEther(calculations.flowRatePerHour)).toFixed(6)}
                </p>
                <p className="text-xs text-muted-foreground">G$/hr</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Per Day
                </p>
                <p className="text-2xl font-bold">
                  {parseFloat(formatEther(calculations.flowRatePerDay)).toFixed(4)}
                </p>
                <p className="text-xs text-muted-foreground">G$/day</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Per Week
                </p>
                <p className="text-2xl font-bold">
                  {parseFloat(formatEther(calculations.flowRatePerWeek)).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">G$/week</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Balance & Claim */}
      {streamData.recipientInfo && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-sm">Claimable Now</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">
                {parseFloat(formatEther(streamData.claimableNow)).toFixed(6)}
              </p>
              <p className="text-sm text-muted-foreground">G$</p>
              
              {streamData.claimableNow > 0n && (
                <Button
                  className="w-full mt-4"
                  onClick={handleClaim}
                  disabled={isPending || isConfirming}
                >
                  {isPending || isConfirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Claiming...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Claim Tokens
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-sm">Total Withdrawn</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">
                {parseFloat(formatEther(streamData.recipientInfo.totalWithdrawn)).toFixed(6)}
              </p>
              <p className="text-sm text-muted-foreground">G$</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-sm">Projected Total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-600">
                {calculations ? parseFloat(formatEther(calculations.projectedTotal)).toFixed(6) : '0'}
              </p>
              <p className="text-sm text-muted-foreground">G$</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stream Details */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Stream Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Sender</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono glass-card border border-border/50 px-2 py-1 rounded">
                  {formatAddress(streamData.sender)}
                </code>
                {isUserSender && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">You</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(`https://celoscan.io/address/${streamData.sender}`, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-1">Total Deposit</p>
              <p className="text-lg font-semibold">
                {parseFloat(formatEther(streamData.deposit)).toFixed(4)} G$
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm text-muted-foreground mb-2">Recipients ({streamData.recipients.length})</p>
            <div className="space-y-2">
              {streamData.recipients.map((recipient: string, index: number) => (
                <div key={index} className="flex items-center justify-between glass-card border border-border/50 px-3 py-2 rounded">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">{formatAddress(recipient)}</code>
                    {address && recipient.toLowerCase() === address.toLowerCase() && (
                      <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">You</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`https://celoscan.io/address/${recipient}`, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Superfluid Console Link */}
          <div className="pt-4 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(`https://console.superfluid.finance/celo/accounts/${address}`, '_blank')}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View in Superfluid Console
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
