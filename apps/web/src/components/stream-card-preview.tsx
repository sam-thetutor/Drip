"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useMemo } from "react";
import { getTokenByAddress } from "@/components/token-selector";
import { useChainId } from "wagmi";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface StreamCardPreviewProps {
  streamId: bigint;
  sender: string;
  recipients: string[];
  token: string;
  startTime: bigint;
  endTime: bigint;
  status: number; // 0=Pending 1=Active 2=Paused 3=Cancelled 4=Completed
  title?: string;
  userRole?: "sender" | "recipient" | "both";
}

const STATUS_LABEL: Record<number, string> = {
  0: "Pending",
  1: "Active",
  2: "Paused",
  3: "Cancelled",
  4: "Completed",
};

const STATUS_COLOR: Record<number, string> = {
  0: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  1: "bg-green-500/10 text-green-500 border-green-500/20",
  2: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  3: "bg-red-500/10 text-red-500 border-red-500/20",
  4: "bg-muted/40 text-muted-foreground border-border",
};

export function StreamCardPreview({
  streamId,
  sender,
  recipients,
  token,
  startTime,
  endTime,
  status,
  title,
  userRole,
}: StreamCardPreviewProps) {
  const chainId = useChainId();
  const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId);
  const symbol = tokenInfo?.symbol ?? "Token";

  const timeRemaining = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const end = Number(endTime);
    if (end <= now) return "Ended";
    const secs = end - now;
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }, [endTime]);

  const progress = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const start = Number(startTime);
    const end = Number(endTime);
    if (end <= start) return 0;
    return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  }, [startTime, endTime]);

  const formatAddr = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  return (
    <Card className="glass-card hover:shadow-lg hover:border-primary/30 transition-all cursor-pointer h-full">
      <CardContent className="p-4 space-y-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate leading-tight">
              {title || `Stream #${streamId.toString()}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              #{streamId.toString()}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Role badge */}
            {userRole === "sender" && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <ArrowUpRight className="h-3 w-3" />
                Sending
              </span>
            )}
            {userRole === "recipient" && (
              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <ArrowDownLeft className="h-3 w-3" />
                Receiving
              </span>
            )}
            {/* Status badge */}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLOR[status] ?? ""}`}>
              {STATUS_LABEL[status] ?? "Unknown"}
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Recipients</p>
            <p className="font-semibold">
              {recipients.length} · {symbol}
            </p>
          </div>
          {(status === 1 || status === 2) && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">
                {status === 2 ? "Paused — time left" : "Ends in"}
              </p>
              <p className="font-semibold tabular-nums">{timeRemaining}</p>
            </div>
          )}
          {(status === 3 || status === 4) && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">From</p>
              <p className="font-mono text-xs">{formatAddr(sender)}</p>
            </div>
          )}
        </div>

        {/* Active pulse dot */}
        {status === 1 && (
          <div className="flex items-center gap-1.5 text-xs text-green-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span>Streaming live</span>
          </div>
        )}

        {/* Progress bar */}
        {(status === 1 || status === 2) && (
          <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
