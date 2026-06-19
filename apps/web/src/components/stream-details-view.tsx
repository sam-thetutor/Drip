"use client";

import { useState, useCallback } from "react";
import { useAccount, useChainId, useBalance, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { erc20Abi, parseUnits, formatUnits as fmtUnits } from "viem";
import {
  useDripV4Stream,
  useDripV4ActiveRecipients,
  useDripV4RecipientStatus,
  usePauseStream,
  useResumeStream,
  useCancelStream,
  useRefreshEndTime,
  useTopUpStream,
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
  RefreshCw,
  UserMinus,
  AlertCircle,
  PlusCircle,
  Share2,
  AlertTriangle,
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

// ─── Top-Up Modal ─────────────────────────────────────────────────────────────
// Top-up = direct ERC20 transfer to the vault address, then refreshEndTime.
// No DripV4 approval needed; the token just moves from sender → vault.

function TopUpModal({
  streamId,
  vaultAddress,
  tokenAddress,
  tokenSymbol,
  tokenDecimals,
  totalFlowRate,
  currentVaultBalance,
  isOpen,
  onClose,
  onSuccess,
}: {
  streamId: bigint;
  vaultAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  totalFlowRate: bigint;
  currentVaultBalance: bigint;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { address }  = useAccount();
  const chainId      = useChainId();
  const publicClient = usePublicClient();
  const dripAddr     = getContractAddress(chainId, "DripV4");
  const [amount, setAmount] = useState("");
  const [step, setStep]     = useState<"input" | "approving" | "adding" | "done" | "error">("input");
  const [errMsg, setErrMsg] = useState("");

  const { data: userBalance } = useBalance({
    address, token: tokenAddress,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const { topUp } = useTopUpStream();
  const { writeContractAsync } = useWriteContract();
  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && dripAddr ? [address, dripAddr] : undefined,
    query: { enabled: !!address && !!dripAddr },
  });

  const amtNum     = parseFloat(amount || "0");
  const amtWei     = amtNum > 0 ? parseUnits(amount, tokenDecimals) : 0n;
  const userBalNum = userBalance ? parseFloat(fmtUnits(userBalance.value, tokenDecimals)) : 0;

  // Estimated new end time after top-up
  const newVaultBalance = currentVaultBalance + amtWei;
  const newDuration     = totalFlowRate > 0n ? Number(newVaultBalance / totalFlowRate) : 0;
  const newEndDate      = newDuration > 0 ? new Date(Date.now() + newDuration * 1000) : null;

  // Atomic top-up: approve the stream token (only if needed), then call topUp —
  // which funds the vault AND recalculates endTime in a single tx, so endTime
  // can never drift from the balance.
  const doTopUp = async () => {
    if (!amtWei || amtNum > userBalNum || !dripAddr || !publicClient) return;
    try {
      if ((allowance ?? 0n) < amtWei) {
        setStep("approving");
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [dripAddr, amtWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStep("adding");
      const hash = await topUp(streamId, amtWei);
      await publicClient.waitForTransactionReceipt({ hash });

      setStep("done");
      onSuccess();
    } catch (e: any) {
      setStep("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? "Top-up failed");
    }
  };

  const reset = () => { setAmount(""); setStep("input"); setErrMsg(""); };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="glass-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-green-500" /> Add money to this plan
          </DialogTitle>
          <DialogDescription>
            Add more {tokenSymbol} — your plan will run longer automatically.
          </DialogDescription>
        </DialogHeader>

        {step === "done" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-green-500 shrink-0" />
              <p className="text-sm text-green-400">Funds added! End time has been updated.</p>
            </div>
            <DialogFooter><Button onClick={() => { reset(); onClose(); }}>Close</Button></DialogFooter>
          </div>
        )}

        {step === "error" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-red-400 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3">{errMsg}</p>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Try Again</Button>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        )}

        {!["done","error"].includes(step) && (
          <div className="space-y-4 py-2">
            {/* Balances */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5">
                <p className="text-xs text-muted-foreground mb-0.5">Your balance</p>
                <p className="font-semibold tabular-nums">{userBalNum.toFixed(2)} {tokenSymbol}</p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground mb-0.5">In this plan</p>
              <p className="font-semibold tabular-nums">
                  {parseFloat(fmtUnits(currentVaultBalance, tokenDecimals)).toFixed(2)} {tokenSymbol}
                </p>
              </div>
            </div>

            {/* Amount input */}
            <div className="space-y-1.5">
              <Label>Amount to add</Label>
              <div className="flex gap-2">
                <Input
                  type="number" min="0" step="1" placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={step !== "input"}
                  className="flex-1"
                />
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => setAmount(userBalNum.toFixed(tokenDecimals))}
                  disabled={step !== "input"}
                >
                  Max
                </Button>
              </div>
              {amtNum > userBalNum && amtNum > 0 && (
                <p className="text-xs text-red-400">Exceeds your balance</p>
              )}
            </div>

            {/* New end time estimate */}
            {amtWei > 0n && newEndDate && (
              <div className="rounded-lg bg-primary/8 border border-primary/20 px-3 py-2.5 text-sm space-y-1">
                <p className="text-xs text-muted-foreground">New estimated end time</p>
                <p className="font-semibold text-primary">{newEndDate.toLocaleString()}</p>
              </div>
            )}

            {/* Progress indicator */}
            {["approving","adding"].includes(step) && (
              <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-primary">
                  {step === "approving" ? `Approving ${tokenSymbol}…` : "Adding funds & updating end time…"}
                </span>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={step !== "input"}>
                Cancel
              </Button>
              <Button
                onClick={doTopUp}
                disabled={!amtWei || amtNum > userBalNum || step !== "input"}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Add {amtNum > 0 ? `${amtNum.toLocaleString()} ${tokenSymbol}` : "Funds"}
              </Button>
            </DialogFooter>
          </div>
        )}
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
            <AlertCircle className="h-5 w-5" /> Cancel plan
          </DialogTitle>
          <DialogDescription>
            All buckets stop receiving money immediately and the remaining balance is refunded to you. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Keep plan</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Cancelling…</> : "Yes, cancel plan"}
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
  isStreamActive,
}: {
  streamId: bigint;
  recipient: `0x${string}`;
  flowRate: bigint;
  tokenSymbol: string;
  tokenDecimals: number;
  isSender: boolean;
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
      toast.loading("Pausing bucket…", { id: `pause-r-${recipient}` });
      await pauseRecipient(streamId, recipient);
      toast.success("Bucket paused", { id: `pause-r-${recipient}` });
      refetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed", { id: `pause-r-${recipient}` });
    }
  };

  const handleResume = async () => {
    try {
      toast.loading("Resuming bucket…", { id: `resume-r-${recipient}` });
      await resumeRecipient(streamId, recipient);
      toast.success("Bucket resumed", { id: `resume-r-${recipient}` });
      refetch();
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed", { id: `resume-r-${recipient}` });
    }
  };

  const handleRemove = async () => {
    try {
      toast.loading("Removing bucket…", { id: `remove-r-${recipient}` });
      await removeRecipient(streamId, recipient);
      toast.success("Bucket removed", { id: `remove-r-${recipient}` });
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
              disabled={anyPending}
              title="Resume bucket"
            >
              {resumingR ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            </Button>
          ) : (
            <Button
              variant="outline" size="sm"
              onClick={handlePause}
              disabled={anyPending}
              title="Pause bucket"
            >
              {pausingR ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
            </Button>
          )}
          <Button
            variant="destructive" size="sm"
            onClick={handleRemove}
            disabled={anyPending}
            title="Remove bucket"
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
  const publicClient = usePublicClient();

  const { stream, isLoading, refetch } = useDripV4Stream(streamId);
  const { recipients: activeRecipients, flowRates: activeFlowRates, refetch: refetchRecipients } =
    useDripV4ActiveRecipients(streamId);

  const { pauseStream,   isPending: pausing   } = usePauseStream();
  const { resumeStream,  isPending: resuming  } = useResumeStream();
  const { cancelStream,  isPending: cancelling } = useCancelStream();
  const { refreshEndTime, isPending: refreshing } = useRefreshEndTime();

  const [showCancel, setShowCancel] = useState(false);
  const [showTopUp,  setShowTopUp]  = useState(false);

  const handleRefetch = useCallback(() => { refetch(); refetchRecipients(); }, [refetch, refetchRecipients]);

  // Wait for an action's tx to be mined before refetching, otherwise we read
  // stale on-chain state (e.g. old endTime / status) right after submitting.
  const waitAndRefetch = useCallback(async (hash?: `0x${string}`) => {
    if (publicClient && hash) {
      try { await publicClient.waitForTransactionReceipt({ hash }); } catch { /* fall through to refetch */ }
    }
    handleRefetch();
  }, [publicClient, handleRefetch]);

  // ── Loading / error states ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading plan…</span>
      </div>
    );
  }

  if (!stream) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <p className="text-destructive font-medium">Plan not found</p>
            <p className="text-sm text-muted-foreground">
              This plan doesn't exist, or you may be on the wrong network.
            </p>
            <div className="flex gap-2 justify-center">
              <Button asChild variant="outline"><Link href="/streams">View all plans</Link></Button>
              <Button asChild><Link href="/streams/create">Set up a plan</Link></Button>
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

  const now      = BigInt(Math.floor(Date.now() / 1000));
  // Remaining runway from the live vault balance (robust to a stale on-chain
  // endTime after top-ups); fall back to endTime when balance is unknown.
  const remaining = isLive
    ? (stream.vaultBalance !== undefined && stream.totalFlowRate > 0n
        ? Number(stream.vaultBalance / stream.totalFlowRate)
        : (stream.endTime > now ? Number(stream.endTime - now) : 0))
    : 0;
  // Effective end time for display = now + remaining runway.
  const effectiveEndTime = isLive && remaining > 0
    ? BigInt(Math.floor(Date.now() / 1000) + remaining)
    : stream.endTime;

  // Amount that has actually flowed out so far = what was set aside minus
  // what's still in the vault. (The deposit buffer cancels out, so this is the
  // net streamed to recipients.) Keeps the three money cards consistent:
  //   Set aside = Streamed so far + Left to flow.
  const streamedSoFar =
    stream.vaultBalance !== undefined
      ? (stream.depositAmount > stream.vaultBalance
          ? stream.depositAmount - stream.vaultBalance
          : 0n)
      : undefined;

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
      toast.loading("Pausing plan…", { id: "stream-action" });
      const hash = await pauseStream(streamId);
      toast.success("Plan paused", { id: "stream-action" });
      await waitAndRefetch(hash);
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed to pause", { id: "stream-action" });
    }
  };

  const handleResume = async () => {
    try {
      toast.loading("Resuming plan…", { id: "stream-action" });
      const hash = await resumeStream(streamId);
      toast.success("Plan resumed", { id: "stream-action" });
      await waitAndRefetch(hash);
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed to resume", { id: "stream-action" });
    }
  };

  const handleCancel = async () => {
    try {
      toast.loading("Cancelling plan…", { id: "stream-action" });
      const hash = await cancelStream(streamId);
      toast.success("Plan cancelled — balance refunded", { id: "stream-action" });
      setShowCancel(false);
      await waitAndRefetch(hash);
    } catch (e: any) {
      toast.error(e?.shortMessage || e?.message || "Failed to cancel", { id: "stream-action" });
    }
  };

  const handleRefreshEndTime = async () => {
    try {
      toast.loading("Refreshing end time…", { id: "refresh" });
      const hash = await refreshEndTime(streamId);
      await waitAndRefetch(hash);
      toast.success("End time updated", { id: "refresh" });
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
                {stream.title || `Plan #${streamId.toString()}`}
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
              <p>{fmtTime(effectiveEndTime)}</p>
            </div>
          </div>

          {/* Stream controls — sender only */}
          {isUserSender && isLive && (
            <div className="flex flex-wrap gap-2 pt-4 border-t">
              {isActive ? (
                <Button variant="outline" onClick={handlePause} disabled={anyActionPending}>
                  {pausing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Pause className="h-4 w-4 mr-2" />}
                  Pause plan
                </Button>
              ) : (
                <Button variant="outline" onClick={handleResume} disabled={anyActionPending}>
                  {resuming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Resume plan
                </Button>
              )}

              <Button
                variant="outline"
                onClick={() => setShowTopUp(true)}
                disabled={anyActionPending}
                className="text-green-400 border-green-500/30 hover:bg-green-500/10"
              >
                <PlusCircle className="h-4 w-4 mr-2" /> Add money
              </Button>

              {/* Hidden for now — end time is refreshed automatically in code
                  (atomic top-up + keeper), so the manual button is redundant. */}
              {false && (
                <Button
                  variant="outline"
                  onClick={handleRefreshEndTime}
                  disabled={anyActionPending}
                  title="Recalculate end time from current vault balance"
                >
                  {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Refresh End Time
                </Button>
              )}

              <Button
                variant="destructive"
                onClick={() => setShowCancel(true)}
                disabled={anyActionPending}
              >
                <X className="h-4 w-4 mr-2" /> Cancel plan
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expiry warning banner */}
      {isLive && (() => {
        const expirySecsLeft = remaining;
        if (expirySecsLeft <= 0) return null;
        const isCritical = expirySecsLeft < 86_400;
        const isWarning  = expirySecsLeft < 172_800;
        if (!isCritical && !isWarning) return null;
        const label = isCritical
          ? `This plan finishes in ${fmtDuration(expirySecsLeft)} — it will stop automatically when the money runs out.`
          : `This plan finishes in ${fmtDuration(expirySecsLeft)}.`;
        return (
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3.5 border ${
            isCritical
              ? "bg-red-500/10 border-red-500/25 text-red-400"
              : "bg-orange-500/10 border-orange-500/25 text-orange-400"
          }`}>
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium">{isCritical ? "Expiring soon! " : "Heads up: "}</span>
              {label}
            </div>
            {isUserSender && (
              <button
                onClick={() => setShowTopUp(true)}
                className={`flex-shrink-0 text-xs font-semibold underline underline-offset-2 ${
                  isCritical ? "text-red-300 hover:text-red-200" : "text-orange-300 hover:text-orange-200"
                }`}
              >
                Add money
              </button>
            )}
          </div>
        );
      })()}

      {/* Analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Card className="glass-card">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <p className="text-xl md:text-2xl font-bold">
              {streamedSoFar !== undefined ? fmtToken(streamedSoFar) : "—"}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Streamed so far</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <p className="text-xl md:text-2xl font-bold text-blue-500">
              {fmtToken(stream.depositAmount)}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Set aside</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
            <p className="text-xl md:text-2xl font-bold text-green-500">
              {stream.vaultBalance !== undefined ? fmtToken(stream.vaultBalance) : "—"}
            </p>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">Left to flow</p>
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
              <span className="text-muted-foreground">Plan progress</span>
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
              <span>{fmtTime(effectiveEndTime)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recipients */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>
            Buckets ({stream.recipients.length})
            {activeRecipients.length < stream.recipients.length && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                · {activeRecipients.length} active
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stream.recipients.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">No buckets</p>
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
              <p className="text-xs text-muted-foreground">Plan ID</p>
              <p className="font-mono text-sm">{streamId.toString()}</p>
              <p className="text-xs text-muted-foreground mt-2">Vault address</p>
              <p className="font-mono text-xs">{stream.vault}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  const url = `${window.location.origin}/streams/${streamId.toString()}`;
                  if (navigator.share) {
                    navigator.share({ title: stream.title || `Plan #${streamId}`, url });
                  } else {
                    navigator.clipboard.writeText(url);
                    toast.success("Plan link copied!");
                  }
                }}
              >
                <Share2 className="h-4 w-4 mr-2" /> Share
              </Button>
              <Button variant="outline" asChild>
                <a href={`${explorerBase}/address/${stream.vault}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Vault on Explorer
                </a>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modals */}
      <TopUpModal
        streamId={streamId}
        vaultAddress={stream.vault as `0x${string}`}
        tokenAddress={stream.token as `0x${string}`}
        tokenSymbol={symbol}
        tokenDecimals={decimals}
        totalFlowRate={stream.totalFlowRate}
        currentVaultBalance={stream.vaultBalance ?? 0n}
        isOpen={showTopUp}
        onClose={() => setShowTopUp(false)}
        onSuccess={handleRefetch}
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
