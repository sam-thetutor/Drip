"use client";

import { useAccount } from "wagmi";
import { useDripV4Streams, StreamStatus, type DripV4Stream } from "@/lib/contracts/hooks/useDripV4";
import { StreamCardPreview } from "@/components/stream-card-preview";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useMemo } from "react";

// DripV4 enum: Active=0 Paused=1 Completed=2 Cancelled=3
type RoleGroup = { active: DripV4Stream[]; paused: DripV4Stream[]; history: DripV4Stream[] };

function groupByStatus(streams: DripV4Stream[]): RoleGroup {
  const result: RoleGroup = { active: [], paused: [], history: [] };
  streams.forEach((s) => {
    if (s.status === StreamStatus.Active)    result.active.push(s);
    else if (s.status === StreamStatus.Paused)   result.paused.push(s);
    else result.history.push(s);
  });
  return result;
}

export function StreamsDashboard() {
  const { address, isConnected } = useAccount();
  const { streams: allStreams, analytics, isLoading } = useDripV4Streams(address);

  const { sending, receiving } = useMemo(() => {
    const sentList: DripV4Stream[]  = [];
    const recvList: DripV4Stream[]  = [];

    allStreams.forEach((s) => {
      if (s.userRole === "sender")    sentList.push(s);
      else if (s.userRole === "recipient") recvList.push(s);
      else if (s.userRole === "both") { sentList.push(s); recvList.push(s); }
    });

    return { sending: groupByStatus(sentList), receiving: groupByStatus(recvList) };
  }, [allStreams]);

  if (!isConnected || !address) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Please connect your wallet to view your streams
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading streams…</span>
      </div>
    );
  }

  if (analytics.totalStreams === 0) {
    return (
      <div className="text-center py-16 border rounded-lg space-y-3">
        <p className="text-lg font-medium">No streams yet</p>
        <p className="text-sm text-muted-foreground">Create your first capped, auto-stopping stream</p>
        <Button asChild variant="outline">
          <Link href="/streams/create">
            <Plus className="h-4 w-4 mr-2" />
            Create your first stream
          </Link>
        </Button>
      </div>
    );
  }

  const sendingCount   = sending.active.length + sending.paused.length + sending.history.length;
  const receivingCount = receiving.active.length + receiving.paused.length + receiving.history.length;

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card className="glass-card card-hover">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold text-foreground">{analytics.totalStreams}</div>
            <div className="text-xs md:text-sm text-muted-foreground mt-1">Total</div>
          </CardContent>
        </Card>
        <Card className="glass-card card-hover">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold text-blue-400">{sendingCount}</div>
            <div className="text-xs md:text-sm text-muted-foreground mt-1">Sending</div>
          </CardContent>
        </Card>
        <Card className="glass-card card-hover">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold text-purple-400">{receivingCount}</div>
            <div className="text-xs md:text-sm text-muted-foreground mt-1">Receiving</div>
          </CardContent>
        </Card>
        <Card className="glass-card card-hover">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <div className="text-xl md:text-2xl font-bold text-green-500">{analytics.activeStreams}</div>
            <div className="text-xs md:text-sm text-muted-foreground mt-1">Active</div>
          </CardContent>
        </Card>
      </div>

      {/* Streams I Send */}
      {sendingCount > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-1 border-b border-border">
            <ArrowUpRight className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-foreground">Streams I Send</h2>
            <span className="text-sm text-muted-foreground">({sendingCount})</span>
          </div>
          <StreamGroup label="Active"  dotClass="text-green-500"         streams={sending.active} />
          <StreamGroup label="Paused"  dotClass="text-orange-500"        streams={sending.paused} />
          <StreamGroup label="History" dotClass="text-muted-foreground"  streams={sending.history} />
        </div>
      )}

      {/* Streams I Receive */}
      {receivingCount > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 pb-1 border-b border-border">
            <ArrowDownLeft className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-foreground">Streams I Receive</h2>
            <span className="text-sm text-muted-foreground">({receivingCount})</span>
          </div>
          <StreamGroup label="Active"  dotClass="text-green-500"         streams={receiving.active} />
          <StreamGroup label="Paused"  dotClass="text-orange-500"        streams={receiving.paused} />
          <StreamGroup label="History" dotClass="text-muted-foreground"  streams={receiving.history} />
        </div>
      )}
    </div>
  );
}

function StreamGroup({ label, dotClass, streams }: { label: string; dotClass: string; streams: DripV4Stream[] }) {
  if (streams.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs ${dotClass}`}>●</span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">({streams.length})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {streams.map((stream) => (
          <Link
            key={`${stream.userRole}-${stream.streamId.toString()}`}
            href={`/streams/${stream.streamId.toString()}`}
            className="block h-full"
          >
            <StreamCardPreview
              streamId={stream.streamId}
              sender={stream.sender}
              recipients={stream.recipients}
              token={stream.token}
              startTime={stream.startTime}
              endTime={stream.endTime}
              status={stream.status}
              title={stream.title}
              userRole={stream.userRole}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
