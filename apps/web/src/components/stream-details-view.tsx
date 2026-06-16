"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  useDripV4Stream,
  useDripV4ActiveRecipients,
  useDripV4RecipientStatus,
  usePauseStream,
  useResumeStream,
  useCancelStream,
  useLockStreamRate,
  useRefreshEndTime,
  usePauseRecipient,
  useResumeRecipient,
  useRemoveRecipient,
  StreamStatus,
  getStatusLabel,
  type DripV4Stream,
} from "@/lib/contracts/hooks/useDripV4";
import { getContractAddress } from "@/lib/contracts/config";
import { getTokenByAddress } from "@/components/token-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pause,
  Play,
  X,
  Loader2,
  ExternalLink,
  Lock,
  RefreshCw,
  UserMinus,
  AlertCircle,
} from "lucide-react";
import { formatUnits } from "viem";
import { toast } from "sonner";
import Link from "next/link";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtTime(ts: bigint) {
  if (!ts || ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toLocaleString();
}

function fmtDuration(secs: number) {
  if (secs <= 0) return "—";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const STATUS_BADGE: Record<number, string> = {
  [StreamStatus.Active]:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  [StreamStatus.Paused]:    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  [StreamStatus.Completed]: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  [StreamStatus.Cancelled]: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

// ─── Lock Rate Modal ──────────────────────────────────────────────────────────

function LockRateModal({
  streamId,
  isOpen,
  onClose,
}: {
  streamId: bigint;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { lockStreamRate, isPending } = useLockStreamRate();
  const [value, setValue] = useState("");
  const [unit,  setUnit]  = useState<"days" | "hours" | "minutes">("days");

  const handleLock = async () => {
    const num = parseFloat(value);
    if (!num || num <= 0) { toast.error("Enter a valid duration"); return; }
    const seconds = unit === "days" ? num * 86400 : unit === "hours" ? num * 3600 : num * 60;
    if (seconds < 60) { toast.error("Minimum lock duration is 1 minute"); return; }
    try {
      toast.loading("Locking rates…", { id: "lock-rate" });
      await lockStreamRate(streamId, BigInt(Math.floor(seconds)));
      toast.success("Stream rates locked!", { id: "lock-rate" });
      onClose();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed to lock rates", { id: "lock-rate" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" /> Lock Stream Rates
          </DialogTitle>
          <DialogDescription>
            Prevent modifications to recipient rates for a set duration.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Lock duration</Label>
            <div className="flex gap-2">
              <Input
                type="number" min="0.1" step="0.1" placeholder="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1"
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as typeof unit)}
                className="px-3 py-2 border border-input bg-background rounded-md text-sm"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </div>
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">While locked, you cannot:</p>
            <p>· Pause / resume individual recipients</p>
            <p>· Remove recipients</p>
            <p className="mt-2">Pausing, resuming, and cancelling the whole stream are still allowed.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleLock} disabled={isPending || !value || parseFloat(value) <= 0}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Locking…</> : <><Lock className="h-4 w-4 mr-2" />Lock Rates</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cancel confirm dialog ───────────────────────────────────────────────────

function CancelDialog({
  isOpen,
  onConfirm,
  onClose,
  isPending,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="glass-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" /> Cancel Stream
          </DialogTitle>
          <DialogDescription>
            All active CFA flows will stop immediately. The remaining vault balance will be refunded to you. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Keep Stream</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling…</> : "Yes, cancel stream"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recipient row ───────────────────────────────────────────────────────────

function RecipientRow({
  streamId,
  recipient,
  flowRate,
  tokenSymbol,
  tokenDecimals,
  isSender,
  isLocked,
  isStreamActive,
}: {
  streamId: bigint;
  recipient: `0x${string}`;
  flowRate: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  isSender: boolean;
  isLocked: boolean;
  isStreamActive: boolean;
}) {
  const { address }              = useAccount();
  const { isPaused, isRemoved, refetch }  = useDripV4RecipientStatus(streamId, recipient);
  const { pauseRecipient,  isPending: pausingR  } = usePauseRecipient();
  const { resumeRecipient, isPending: resumingR } = useResumeRecipient();
  const { removeRecipient, isPending: removingR } = useRemoveRecipient();

  const isMe = address?.toLowerCase() === recipient.toLowerCase();
  const ratePerHour = (flowRate * 3600n);

  const handlePause = async () => {
    try {
      toast.loading("Pausing recipient…", { id: `pause-r-${recipient}` });
      await pauseRecipient(streamId, recipient);
      toast.success("Recipient paused", { id: `pause-r-${recipient}` });
      refetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed", { id: `pause-r-${recipient}` });
    }
  };

  const handleResume = async () => {
    try {
      toast.loading("Resuming recipient…", { id: `resume-r-${recipient}` });
      await resumeRecipient(streamId, recipient);
      toast.success("Recipient resumed", { id: `resume-r-${recipient}` });
      refetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed", { id: `resume-r-${recipient}` });
    }
  };

  const handleRemove = async () => {
    try {
      toast.loading("Removing recipient…", { id: `remove-r-${recipient}` });
      await removeRecipient(streamId, recipient);
      toast.success("Recipient removed", { id: `remove-r-${recipient}` });
      refetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed", { id: `remove-r-${recipient}` });
    }
  };

  const anyPending = pausingR || resumingR || removingR;

  return (
    <div className={`flex items-center justify-between p-4 border rounded-lg gap-4 ${isRemoved ? "opacity-50" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <p className="font-mono text-sm font-medium">{fmtAddr(recipient)}</p>
          {isMe && (
            <span className="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded-full">You</span>
          )}
          {isRemoved && (
            <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-500 border border-red-500/20 rounded-full">Removed</span>
          )}
          {isPaused && !isRemoved && (
            <span className="px-2 py-0.5 text-xs bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-full">Paused</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 text-sm mt-2">
          <div>
            <p className="text-xs text-muted-foreground">Flow rate</p>
            <p className="font-medium tabular-nums">
              {parseFloat(formatUnits(ratePerHour, tokenDecimals)).toFixed(6)} {tokenSymbol}/hr
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Per second</p>
            <p className="font-medium tabular-nums text-xs font-mono">
              {parseFloat(formatUnits(flowRate, tokenDecimals)).toFixed(10)}
            </p>
          </div>
        </div>
      </div>

      {isSender && isStreamActive && !isRemoved && (
        <div className="flex gap-2 shrink-0">
          {isPaused ? (
            <Button
              variant="outline" size="sm"
              onClick={handleResume}
              disabled={anyPending || isLocked}
              title={isLocked ? "Rate lock active" : "Resume recipient"}
            >
              {resumingR ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
          ) : (
            <Button
              variant="outline" size="sm"
              onClick={handlePause}
              disabled={anyPending || isLocked}
              title={isLocked ? "Rate lock active" : "Pause recipient"}
            >
              {pausingR ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
          <Button
            variant="destructive" size="sm"
            onClick={handleRemove}
            disabled={anyPending || isLocked}
            title={isLocked ? "Rate lock active" : "Remove recipient"}
          >
            {removingR ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main detail view ─────────────────────────────────────────────────────────

interface StreamDetailsViewProps {
  streamId: bigint;
}

export function StreamDetailsView({ streamId }: StreamDetailsViewProps) {
  const { address }  = useAccount();
  const chainId      = useChainId();

  const { stream, isLoading, refetch } = useDripV4Stream(streamId);
  const { recipients: activeRecipients, flowRates: activeFlowRates, refetch: refetchRecipients } =
    useDripV4ActiveRecipients(streamId);

  const { pauseStream,   isPending: pausing   } = usePauseStream();
  const { resumeStream,  isPending: resuming  } = useResumeStream();
  const { cancelStream,  isPending: cancelling } = useCancelStream();
  const { refreshEndTime, isPending: refreshing } = useRefreshEndTime();

  const [showLock,   setShowLock]   = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const handleRefetch = useCallback(() => { refetch(); refetchRecipients(); }, [refetch, refetchRecipients]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading stream…</span>
      </div>
    );
  }

  if (!stream) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <p className="text-destructive font-medium">Stream not found</p>
            <p className="text-sm text-muted-foreground">
              This stream ID doesn't exist on DripV4, or you may be on the wrong network.
            </p>
            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline"><Link href="/streams">View All Streams</Link></Button>
              <Button asChild><Link href="/streams/create">Create New Stream</Link></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const tokenInfo = getTokenByAddress(stream.token as `0x${string}`, chainId);
  const decimals  = tokenInfo?.decimals ?? 18;
  const symbol    = tokenInfo?.symbol ?? "Token";

  const isUserSender = address?.toLowerCase() === stream.sender.toLowerCase();
  const isActive     = stream.status === StreamStatus.Active;
  const isPaused     = stream.status === StreamStatus.Paused;
  const isLive       = isActive || isPaused;
  const isLocked     = stream.isRateLocked ?? false;

  const now      = BigInt(Math.floor(Date.now() / 1000));
  const remaining = isLive ? (stream.endTime > now ? Number(stream.endTime - now) : 0) : 0;

  const fmtToken = (wei: bigint) =>
    `${parseFloat(formatUnits(wei, decimals)).toFixed(4)} ${symbol}`;

  const dripV4Addr  = getContractAddress(chainId, "DripV4") ?? "";
  const explorerBase =
    chainId === 42220 ? "https://celoscan.io"
    : chainId === 44787 ? "https://alfajores.celoscan.io"
    : "https://celo-sepolia.blockscout.com";
  const explorerUrl = `${explorerBase}/address/${dripV4Addr}`;

  // ── Stream-level actions ────────────────────────────────────────────────────

  const handlePause = async () => {
    try {
      toast.loading("Pausing stream…", { id: "stream-action" });
      await pauseStream(streamId);
      toast.success("Stream paused", { id: "stream-action" });
      handleRefetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed to pause", { id: "stream-action" });
    }
  };

  const handleResume = async () => {
    try {
      toast.loading("Resuming stream…", { id: "stream-action" });
      await resumeStream(streamId);
      toast.success("Stream resumed", { id: "stream-action" });
      handleRefetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed to resume", { id: "stream-action" });
    }
  };

  const handleCancel = async () => {
    try {
      toast.loading("Cancelling stream…", { id: "stream-action" });
      await cancelStream(streamId);
      toast.success("Stream cancelled — vault balance refunded", { id: "stream-action" });
      setShowCancel(false);
      handleRefetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed to cancel", { id: "stream-action" });
    }
  };

  const handleRefreshEndTime = async () => {
    try {
      toast.loading("Refreshing end time…", { id: "refresh" });
      await refreshEndTime(streamId);
      toast.success("End time updated", { id: "refresh" });
      handleRefetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed", { id: "refresh" });
    }
  };

  const anyActionPending = pausing || resuming || cancelling || refreshing;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header card */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-2xl mb-1 truncate">
                {stream.title || `Stream #${streamId.toString()}`}
              </CardTitle>
              {stream.description && (
                <p className="text-muted-foreground text-sm">{stream.description}</p>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {/* Status badge */}
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_BADGE[stream.status] ?? ""}`}>
                {getStatusLabel(stream.status)}
              </span>

              {/* Rate lock badge */}
              {isLocked && (
                <span
                  className="px-3 py-1 text-sm font-medium bg-yellow-500/20 text-yellow-600 rounded-full border border-yellow-500/30 flex items-center gap-1.5"
                  title={`Locked until ${fmtTime(stream.rateLockUntil)}`}
                >
                  <Lock className="h-3.5 w-3.5" /> Rates Locked
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Meta grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">From</p>
              <p className="font-mono">{fmtAddr(stream.sender)}</p>
              {isUserSender && <p className="text-xs text-primary">You</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Token</p>
              <p className="font-semibold">{symbol}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Started</p>
              <p>{fmtTime(stream.startTime)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">{isLive ? "Ends" : "Ended"}</p>
              <p>{fmtTime(stream.endTime)}</p>
            </div>
          </div>

          {/* Rate lock notice */}
          {isLocked && (
            <div className="mb-6 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-3 text-sm">
              <Lock className="h-4 w-4 text-yellow-600 shrink-0" />
              <span className="text-yellow-700 dark:text-yellow-400">
                {isUserSender
                  ? "You cannot modify recipients while rates are locked."
                  : "Your payment rate is protected until " + fmtTime(stream.rateLockUntil) + "."}
              </span>
            </div>
          )}

          {/* Stream controls — sender only */}
          {isUserSender && isLive && (
            <div className="flex flex-wrap gap-2 pt-4 border-t">
              {isActive ? (
                <Button variant="outline" onClick={handlePause} disabled={anyActionPending}>
                  {pausing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pause className="h-4 w-4 mr-2" />}
                  Pause Stream
                </Button>
              ) : (
                <Button variant="outline" onClick={handleResume} disabled={anyActionPending}>
                  {resuming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Resume Stream
                </Button>
              )}

              <Button
                variant="outline"
                onClick={handleRefreshEndTime}
                disabled={anyActionPending}
                title="Recalculate end time from current vault balance"
              >
                {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh End Time
              </Button>

              <Button
                variant="outline"
                onClick={() => setShowLock(true)}
                disabled={anyActionPending || isLocked}
                title={isLocked ? "Already locked" : "Prevent recipient modifications"}
              >
                <Lock className="h-4 w-4 mr-2" /> Lock Rates
              </Button>

              <Button
                variant="destructive"
                onClick={() => setShowCancel(true)}
                disabled={anyActionPending}
              >
                <X className="h-4 w-4 mr-2" /> Cancel Stream
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card className="glass-card">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <p className="text-xl md:text-2xl font-bold">{fmtToken(stream.totalAmount)}</p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Stream Amount</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <p className="text-xl md:text-2xl font-bold text-blue-500">
              {fmtToken(stream.depositAmount)}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Vault Deposit</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <p className="text-xl md:text-2xl font-bold text-green-500">
              {stream.vaultBalance !== undefined ? fmtToken(stream.vaultBalance) : "—"}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Vault Balance (live)</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <p className="text-xl md:text-2xl font-bold">
              {isLive ? fmtDuration(remaining) : "—"}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Time Remaining</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar (active/paused only) */}
      {isLive && stream.percentComplete !== undefined && (
        <Card className="glass-card">
          <CardContent className="pt-4 pb-4 px-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Stream progress</span>
              <span className="font-medium tabular-nums">{stream.percentComplete.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                style={{ width: `${stream.percentComplete}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{fmtTime(stream.startTime)}</span>
              <span>{fmtTime(stream.endTime)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipients */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>
            Recipients ({stream.recipients.length})
            {activeRecipients.length < stream.recipients.length && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                · {activeRecipients.length} active
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stream.recipients.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No recipients</p>
          ) : (
            <div className="space-y-3">
              {stream.recipients.map((recipient, i) => (
                <RecipientRow
                  key={recipient}
                  streamId={streamId}
                  recipient={recipient as `0x${string}`}
                  flowRate={stream.flowRates[i] ?? 0n}
                  tokenSymbol={symbol}
                  tokenDecimals={decimals}
                  isSender={isUserSender}
                  isLocked={isLocked}
                  isStreamActive={isLive}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer: stream metadata + explorer */}
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Stream ID</p>
              <p className="font-mono text-sm">{streamId.toString()}</p>
              <p className="text-xs text-muted-foreground mt-2">Vault address</p>
              <p className="font-mono text-xs">{stream.vault}</p>
            </div>
            <Button variant="outline" asChild>
              <a href={`${explorerBase}/address/${stream.vault}`} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                View Vault on Explorer
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <LockRateModal
        streamId={streamId}
        isOpen={showLock}
        onClose={() => setShowLock(false)}
      />
      <CancelDialog
        isOpen={showCancel}
        onConfirm={handleCancel}
        onClose={() => setShowCancel(false)}
        isPending={cancelling}
      />
    </div>
  );
}
