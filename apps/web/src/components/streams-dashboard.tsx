"use client";

import { useAccount, useChainId } from "wagmi";
import { useDripV4Streams, StreamStatus, type DripV4Stream } from "@/lib/contracts/hooks/useDripV4";
import { getTokenByAddress } from "@/lib/tokens/config";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Plus,
  Loader2,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { useMemo, useState } from "react";

type RoleFilter   = "all" | "sending" | "receiving";
type StatusFilter = "all" | "active" | "paused" | "history";

const STATUS_LABEL: Record<number, string> = {
  0: "Active",
  1: "Paused",
  2: "Completed",
  3: "Cancelled",
};

const STATUS_PILL: Record<number, string> = {
  0: "bg-green-500/15 text-green-400 border-green-500/25",
  1: "bg-orange-500/15 text-orange-400 border-orange-500/25",
  2: "bg-white/8 text-foreground/50 border-white/10",
  3: "bg-red-500/15 text-red-400 border-red-500/25",
};

function timeLeft(endTime: bigint): string {
  const secs = Number(endTime) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "Ended";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StreamRow({ stream, chainId }: { stream: DripV4Stream; chainId: number }) {
  const tokenInfo = getTokenByAddress(stream.token as `0x${string}`, chainId);
  const symbol    = tokenInfo?.symbol ?? "Token";
  const isSending = stream.userRole === "sender" || stream.userRole === "both";
  const isActive  = stream.status === StreamStatus.Active;
  const isPaused  = stream.status === StreamStatus.Paused;

  return (
    <Link
      href={`/streams/${stream.streamId.toString()}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/8 transition-all group"
    >
      {/* Role icon */}
      <div className={`flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg ${
        isSending ? "bg-blue-500/15" : "bg-purple-500/15"
      }`}>
        {isSending
          ? <ArrowUpRight className="h-4 w-4 text-blue-400" />
          : <ArrowDownLeft className="h-4 w-4 text-purple-400" />
        }
      </div>

      {/* Title + ID */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate leading-none">
          {stream.title || `Stream #${stream.streamId.toString()}`}
        </p>
        <p className="text-xs text-foreground/45 mt-0.5 font-mono">
          #{stream.streamId.toString()} · {stream.recipients.length} recipient{stream.recipients.length !== 1 ? "s" : ""} · {symbol}
        </p>
      </div>

      {/* Status badge */}
      <span className={`hidden sm:inline-flex flex-shrink-0 items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_PILL[stream.status] ?? ""}`}>
        {isActive && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />}
        {STATUS_LABEL[stream.status] ?? "Unknown"}
      </span>

      {/* Time remaining */}
      {(isActive || isPaused) && (
        <span className="hidden md:block flex-shrink-0 text-xs text-foreground/50 tabular-nums w-16 text-right">
          {timeLeft(stream.endTime)}
        </span>
      )}

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 text-foreground/30 group-hover:text-foreground/60 transition-colors flex-shrink-0" />
    </Link>
  );
}

export function StreamsDashboard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { streams: allStreams, analytics, isLoading } = useDripV4Streams(address);

  const [roleFilter,   setRoleFilter]   = useState<RoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { sendingAll, receivingAll } = useMemo(() => {
    const s: DripV4Stream[] = [];
    const r: DripV4Stream[] = [];
    allStreams.forEach((st) => {
      if (st.userRole === "sender" || st.userRole === "both")    s.push(st);
      if (st.userRole === "recipient" || st.userRole === "both") r.push(st);
    });
    return { sendingAll: s, receivingAll: r };
  }, [allStreams]);

  const visible = useMemo(() => {
    let list: DripV4Stream[] = [];
    if (roleFilter === "all")       list = allStreams;
    else if (roleFilter === "sending")   list = sendingAll;
    else                            list = receivingAll;

    if (statusFilter === "active")  list = list.filter(s => s.status === StreamStatus.Active);
    else if (statusFilter === "paused")  list = list.filter(s => s.status === StreamStatus.Paused);
    else if (statusFilter === "history") list = list.filter(s => s.status !== StreamStatus.Active && s.status !== StreamStatus.Paused);

    // Dedup by streamId (can appear in both sending + receiving for "both" role)
    const seen = new Set<string>();
    return list.filter((s) => {
      const key = `${s.streamId}-${s.userRole}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allStreams, sendingAll, receivingAll, roleFilter, statusFilter]);

  if (!isConnected || !address) {
    return (
      <Card className="glass-card">
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Connect your wallet to view your streams.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (analytics.totalStreams === 0) {
    return (
      <div className="glass-card rounded-2xl py-16 text-center space-y-4">
        <Inbox className="h-10 w-10 mx-auto text-foreground/25" />
        <div>
          <p className="text-base font-medium text-white">No streams yet</p>
          <p className="text-sm text-foreground/50 mt-1">Create your first capped, auto-stopping stream</p>
        </div>
        <Button asChild>
          <Link href="/streams/create">
            <Plus className="h-4 w-4 mr-2" />
            Create stream
          </Link>
        </Button>
      </div>
    );
  }

  const filterPill = (active: boolean, onClick: () => void, label: string) => (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
        active
          ? "bg-green/20 text-green border-green/40"
          : "bg-white/5 text-foreground/55 border-white/10 hover:bg-white/10 hover:text-foreground/80"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Role filters */}
        <div className="flex items-center gap-1.5">
          {filterPill(roleFilter === "all",       () => setRoleFilter("all"),       "All")}
          {filterPill(roleFilter === "sending",   () => setRoleFilter("sending"),   `Sending (${sendingAll.length})`)}
          {filterPill(roleFilter === "receiving", () => setRoleFilter("receiving"), `Receiving (${receivingAll.length})`)}
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-white/10" />

        {/* Status filters */}
        <div className="flex items-center gap-1.5">
          {filterPill(statusFilter === "all",     () => setStatusFilter("all"),     "All status")}
          {filterPill(statusFilter === "active",  () => setStatusFilter("active"),  `Active (${analytics.activeStreams})`)}
          {filterPill(statusFilter === "paused",  () => setStatusFilter("paused"),  "Paused")}
          {filterPill(statusFilter === "history", () => setStatusFilter("history"), "History")}
        </div>

        <span className="ml-auto text-xs text-foreground/40 tabular-nums">
          {visible.length} stream{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Stream list */}
      {visible.length === 0 ? (
        <div className="glass-card rounded-2xl py-12 text-center">
          <p className="text-sm text-foreground/50">No streams match this filter</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl divide-y divide-white/5 overflow-hidden">
          {visible.map((stream) => (
            <StreamRow
              key={`${stream.userRole}-${stream.streamId.toString()}`}
              stream={stream}
              chainId={chainId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
