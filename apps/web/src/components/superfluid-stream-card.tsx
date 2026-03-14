"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Wifi } from "lucide-react";
import { formatEther } from "viem";
import { useAutoRefreshStreamData } from "@/lib/contracts";
import { usePoolConnection } from "@/lib/contracts/hooks/useSuperfluid";
import { useAccount } from "wagmi";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";

interface SuperfluidStreamCardProps {
  streamId: bigint;
}

export function SuperfluidStreamCard({ streamId }: SuperfluidStreamCardProps) {
  const { address } = useAccount();
  const { streamData, isLoading } = useAutoRefreshStreamData(streamId, address);
  const { isConnected } = usePoolConnection(streamId, address);

  const isRecipient = address && streamData?.recipients.some(
    (r: string) => r.toLowerCase() === address.toLowerCase()
  );

  const statusText = ["Pending", "Active", "Paused", "Cancelled", "Completed"];
  const statusColors: Record<number, string> = {
    0: "bg-yellow-500/10 text-yellow-500",
    1: "bg-green-500/10 text-green-500",
    2: "bg-orange-500/10 text-orange-500",
    3: "bg-red-500/10 text-red-500",
    4: "bg-gray-500/10 text-gray-400",
  };

  const timeRemaining = useMemo(() => {
    if (!streamData) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const secsLeft = streamData.endTime > now ? Number(streamData.endTime - now) : 0;
    if (secsLeft <= 0) return "Ended";
    const days = Math.floor(secsLeft / 86400);
    const hours = Math.floor((secsLeft % 86400) / 3600);
    const mins = Math.floor((secsLeft % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }, [streamData]);

  const flowRatePerHour = useMemo(() => {
    if (!streamData?.recipientInfo) return null;
    return streamData.recipientInfo.ratePerSecond * 3600n;
  }, [streamData]);

  const progress = useMemo(() => {
    if (!streamData) return 0;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (streamData.endTime <= streamData.startTime) return 0;
    const pct = Number(now - streamData.startTime) / Number(streamData.endTime - streamData.startTime) * 100;
    return Math.min(Math.max(pct, 0), 100);
  }, [streamData]);

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
      const cappedNow = Math.min(Date.now(), endMs);
      const elapsedSecs = BigInt(Math.max(0, Math.floor((cappedNow - snapshot) / 1000)));
      setRealtimeClaimable(base + rate * elapsedSecs);
    }, 1000);

    return () => clearInterval(interval);
  }, [streamData]);

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!streamData) {
    return (
      <Card className="glass-card">
        <CardContent className="py-6">
          <p className="text-center text-sm text-muted-foreground">Stream not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={`/streams/${streamData.streamId}`}>
      <Card className="glass-card hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer">
        <CardContent className="p-4 space-y-3">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{streamData.title || `Stream #${streamData.streamId}`}</p>
              <p className="text-xs text-muted-foreground">#{streamData.streamId}</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {isRecipient && isConnected && streamData.status === 1 && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20">
                  <Wifi className="h-2.5 w-2.5 animate-pulse" />
                  Live
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[streamData.status] ?? ""}`}>
                {statusText[streamData.status]}
              </span>
            </div>
          </div>

          {/* Flow rate + ends in */}
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Flow rate</p>
              <p className="font-semibold">
                {flowRatePerHour !== null
                  ? `${parseFloat(formatEther(flowRatePerHour)).toFixed(2)} G$/hr`
                  : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">Ends in</p>
              <p className="font-semibold">{timeRemaining ?? "—"}</p>
            </div>
          </div>

          {/* Live streaming amount — only shown for active streams */}
          {streamData.status === 1 && streamData.recipientInfo && (
            <div className="flex items-center gap-1.5 text-xs text-green-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="tabular-nums font-medium">
                {parseFloat(formatEther(realtimeClaimable)).toFixed(4)} G$
              </span>
              <span className="text-muted-foreground">{isConnected ? 'streaming' : 'claimable'}</span>
            </div>
          )}

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
