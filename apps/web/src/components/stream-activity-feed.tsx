"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { formatUnits } from "viem";
import {
  PlusCircle,
  XCircle,
  CheckCircle2,
  Play,
  ArrowUpCircle,
  ExternalLink,
  RefreshCw,
  Inbox,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useStreamActivity,
  type ActivityEvent,
  type ActivityEventType,
} from "@/lib/contracts/hooks/useStreamActivity";

// ─── Config per event type ────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  ActivityEventType,
  { icon: React.ElementType; dot: string; label: string; textColor: string }
> = {
  created:   { icon: PlusCircle,    dot: "bg-green-500",  label: "Plan started",    textColor: "text-green-400"  },
  cancelled: { icon: XCircle,       dot: "bg-red-500",    label: "Cancelled",       textColor: "text-red-400"    },
  completed: { icon: CheckCircle2,  dot: "bg-blue-500",   label: "Completed",       textColor: "text-blue-400"   },
  resumed:   { icon: Play,          dot: "bg-purple-500", label: "Resumed",         textColor: "text-purple-400" },
  topped_up: { icon: ArrowUpCircle, dot: "bg-cyan-500",   label: "Topped up",       textColor: "text-cyan-400"   },
};

// ─── Formatting helpers ────────────────────────────────────────────────────────

function fmtAmount(wei: bigint, decimals = 18): string {
  const n = parseFloat(formatUnits(wei, decimals));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(n < 0.01 ? 6 : 2);
}

function relativeTime(ts: number): string {
  if (!ts) return "Unknown";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)       return "just now";
  if (diff < 3_600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400)   return `${Math.floor(diff / 3_600)}h ago`;
  if (diff < 604_800)  return `${Math.floor(diff / 86_400)}d ago`;
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayLabel(ts: number): string {
  if (!ts) return "Unknown date";
  const d    = new Date(ts * 1000);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7)   return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Event description ────────────────────────────────────────────────────────

function buildDescription(ev: ActivityEvent): { headline: string; detail?: string } {
  const id = `#${ev.streamId.toString()}`;
  const role = ev.userRole;

  switch (ev.type) {
    case "created": {
      const name = ev.title && ev.title !== `Stream ${ev.streamId}` ? `"${ev.title}"` : id;
      return { headline: `Started plan ${name}` };
    }
    case "cancelled": {
      const from = role === "recipient" ? "Sender cancelled" : "You cancelled";
      const refundPart = ev.refund && ev.refund > 0n
        ? ` · ${fmtAmount(ev.refund)} returned`
        : "";
      return { headline: `${from} plan ${id}`, detail: refundPart || undefined };
    }
    case "completed":
      return {
        headline: `Plan ${id} finished`,
        detail: role === "recipient" ? "All payments received" : "All payments sent",
      };
    case "resumed":
      return { headline: `Plan ${id} resumed` };
    case "topped_up":
      return { headline: `Plan ${id} topped up` };
  }
}

// ─── Single event row ─────────────────────────────────────────────────────────

function EventRow({ ev }: { ev: ActivityEvent }) {
  const cfg  = EVENT_CONFIG[ev.type];
  const Icon = cfg.icon;
  const { headline, detail } = buildDescription(ev);

  return (
    <div className="flex items-start gap-3 group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot} ring-2 ring-background`} />
        <div className="flex-1 w-px bg-white/8 mt-1.5" style={{ minHeight: 28 }} />
      </div>

      {/* Content */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${cfg.textColor}`} />
              <Link
                href={`/streams/${ev.streamId.toString()}`}
                className="text-sm font-medium text-foreground hover:text-green transition-colors truncate max-w-[220px] sm:max-w-none"
              >
                {headline}
              </Link>
            </div>
            {detail && (
              <p className="text-xs text-muted-foreground mt-0.5 ml-5">{detail}</p>
            )}
          </div>
          {/* Right side: time + celoscan */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground tabular-nums">
              {relativeTime(ev.timestamp)}
            </span>
            <a
              href={`https://celoscan.io/tx/${ev.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors opacity-0 group-hover:opacity-100"
              title="View on Celoscan"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Day group ────────────────────────────────────────────────────────────────

function DayGroup({ label, events }: { label: string; events: ActivityEvent[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wide mb-3 pl-5">
        {label}
      </p>
      <div>
        {events.map((ev) => (
          <EventRow key={ev.id} ev={ev} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export function StreamActivityFeed() {
  const { address, isConnected } = useAccount();
  const { events, isLoading, error } = useStreamActivity(address);
  const [shown, setShown] = useState(PAGE_SIZE);

  if (!isConnected || !address) {
    return (
      <div className="glass-card rounded-2xl py-12 text-center">
        <p className="text-muted-foreground text-sm">Connect your wallet to view activity.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className="flex items-start gap-3 animate-pulse">
            <div className="w-2.5 h-2.5 mt-1 rounded-full bg-white/10 flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-48 rounded bg-white/8" />
              <div className="h-2.5 w-24 rounded bg-white/5" />
            </div>
            <div className="h-3 w-12 rounded bg-white/5 flex-shrink-0" />
          </div>
        ))}
        <div className="flex items-center gap-2 text-sm text-muted-foreground pl-5 mt-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Scanning on-chain activity…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center space-y-3">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="glass-card rounded-2xl py-16 text-center space-y-3">
        <Inbox className="h-10 w-10 mx-auto text-foreground/25" />
        <div>
          <p className="text-base font-medium text-white">No activity yet</p>
          <p className="text-sm text-foreground/50 mt-1">
            Events from the last ~2 weeks appear here
          </p>
        </div>
      </div>
    );
  }

  // Group visible events by day
  const visible = events.slice(0, shown);
  const groups: { label: string; events: ActivityEvent[] }[] = [];
  let currentLabel = "";
  for (const ev of visible) {
    const label = dayLabel(ev.timestamp);
    if (label !== currentLabel) {
      currentLabel = label;
      groups.push({ label, events: [] });
    }
    groups[groups.length - 1].events.push(ev);
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {Math.min(shown, events.length)} of {events.length} event{events.length !== 1 ? "s" : ""} · last ~2 weeks
        </p>
        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3">
          {(Object.entries(EVENT_CONFIG) as [ActivityEventType, (typeof EVENT_CONFIG)[ActivityEventType]][]).map(
            ([type, cfg]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </div>
            )
          )}
        </div>
      </div>

      {/* Timeline */}
      <div>
        {groups.map((g) => (
          <DayGroup key={g.label} label={g.label} events={g.events} />
        ))}
      </div>

      {/* Load more */}
      {shown < events.length && (
        <div className="text-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShown((s) => s + PAGE_SIZE)}
          >
            <ChevronDown className="h-3.5 w-3.5 mr-2" />
            Load {Math.min(PAGE_SIZE, events.length - shown)} more
          </Button>
        </div>
      )}
    </div>
  );
}
