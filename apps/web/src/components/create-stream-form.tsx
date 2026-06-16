"use client";

import { useState, useRef, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAccount, useChainId, useReadContract, usePublicClient } from "wagmi";
import { erc20Abi, parseUnits, formatUnits, maxUint256 } from "viem";
import { useCreateDripV4Stream } from "@/lib/contracts/hooks/useDripV4";
import { getContractAddress } from "@/lib/contracts/config";
import { TokenSelector, getTokenByAddress } from "@/components/token-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, X, Loader2, CheckCircle, AlertTriangle,
  ChevronDown, Calendar, Coins, Users,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { usePhoneMapping } from "@/lib/contracts";
import { hashPhoneE164 } from "@/lib/phone/hash";

// ─── Schema ───────────────────────────────────────────────────────────────────

const streamSchema = z.object({
  recipients: z
    .array(
      z.object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
        amountPerPeriod: z
          .string()
          .min(1, "Required")
          .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Must be > 0"),
      })
    )
    .min(1, "At least one recipient"),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Pick a token"),
  cadence: z.enum(["per_minute", "hourly", "daily", "weekly", "monthly", "quarterly"]),
  totalPeriods: z
    .string()
    .min(1, "Required")
    .refine((v) => !isNaN(parseInt(v)) && parseInt(v) > 0, "Must be > 0"),
  title: z.string().max(120).optional(),
  description: z.string().max(1024).optional(),
});

type FormData = z.infer<typeof streamSchema>;
type CadenceKey = FormData["cadence"];

const CADENCE_SECONDS: Record<CadenceKey, number> = {
  per_minute: 60, hourly: 3_600, daily: 86_400,
  weekly: 604_800, monthly: 2_592_000, quarterly: 7_776_000,
};
const CADENCE_SHORT: Record<CadenceKey, string> = {
  per_minute: "min", hourly: "hr", daily: "day",
  weekly: "wk", monthly: "mo", quarterly: "qtr",
};
const CADENCE_LABEL: Record<CadenceKey, string> = {
  per_minute: "Every minute", hourly: "Every hour", daily: "Every day",
  weekly: "Every week", monthly: "Every month", quarterly: "Every quarter",
};

const BUFFER_SECONDS = 14_400n;

// ─── Tx phase ─────────────────────────────────────────────────────────────────

type TxPhase = "idle" | "approving" | "waitApprove" | "creating" | "waitCreate";

function phaseLabel(phase: TxPhase, sym: string, needsApprove: boolean): string {
  switch (phase) {
    case "approving":    return `Confirm approval in wallet… (1/2)`;
    case "waitApprove":  return `Confirming ${sym} approval… (1/2)`;
    case "creating":     return needsApprove ? "Confirm stream in wallet… (2/2)" : "Confirm stream in wallet…";
    case "waitCreate":   return needsApprove ? "Confirming stream… (2/2)" : "Confirming stream…";
    default:             return "";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtWei(wei: bigint, decimals: number, symbol: string, fractions = 4) {
  const n = parseFloat(formatUnits(wei, decimals));
  return `${n < 0.0001 && n > 0 ? n.toExponential(2) : n.toFixed(fractions)} ${symbol}`;
}
function fmtDateFull(d: Date) {
  return d.toLocaleString(undefined, {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function fmtDateShort(d: Date) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 border border-primary/30 shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Step pill (shown while a tx is in flight) ────────────────────────────────

function TxProgressPill({ phase, sym }: { phase: TxPhase; sym: string }) {
  if (phase === "idle") return null;
  const steps = [
    { key: "approve", label: `Approve ${sym}`, done: phase === "creating" || phase === "waitCreate" },
    { key: "create",  label: "Create stream",  done: phase === "waitCreate" },
  ];
  const approveNeeded = phase === "approving" || phase === "waitApprove";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      {approveNeeded && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="font-medium text-primary">Approve {sym}</span>
          </div>
          <span className="text-muted-foreground/40 text-xs">→</span>
          <span className="text-sm text-muted-foreground">Create stream</span>
        </>
      )}
      {!approveNeeded && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            <span>{sym} approved</span>
          </div>
          <span className="text-muted-foreground/40 text-xs">→</span>
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="font-medium text-primary">Create stream</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SummaryProps {
  tokenMeta: { symbol: string; decimals: number } | undefined;
  tokenBalance: bigint | undefined;
  totalAmountWei: bigint;
  depositWei: bigint;
  estimatedEndDate: Date | null;
  needsApproval: boolean;
  hasInsufficientBalance: boolean;
  zeroRateIndices: number[];
  phase: TxPhase;
  onAction: () => void;
  canSubmit: boolean;
}

function SummaryCard({
  tokenMeta, tokenBalance, totalAmountWei, depositWei,
  estimatedEndDate, needsApproval, hasInsufficientBalance,
  zeroRateIndices, phase, onAction, canSubmit,
}: SummaryProps) {
  const sym = tokenMeta?.symbol ?? "—";
  const dec = tokenMeta?.decimals ?? 18;
  const bufferWei = depositWei > totalAmountWei ? depositWei - totalAmountWei : 0n;
  const bufferPct = totalAmountWei > 0n ? Math.round(Number((bufferWei * 100n) / totalAmountWei)) : 0;
  const isBusy    = phase !== "idle";
  const hasError  = hasInsufficientBalance || zeroRateIndices.length > 0;
  const isReady   = canSubmit && !hasError && depositWei > 0n;

  return (
    <div className="space-y-3">
      {/* Summary card */}
      <div className="glass-card rounded-xl border border-white/8 p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Summary</p>

        {depositWei === 0n ? (
          <p className="text-sm text-muted-foreground text-center py-6 leading-relaxed">
            Fill in the form to see<br />a live breakdown
          </p>
        ) : (
          <>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-muted-foreground">Stream amount</span>
                <span className="font-medium tabular-nums">{fmtWei(totalAmountWei, dec, sym)}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-muted-foreground">
                  Buffer
                  {bufferPct > 0 && <span className="ml-1 text-xs opacity-60">({bufferPct}% · refunded)</span>}
                </span>
                <span className="text-amber-400 tabular-nums">+{fmtWei(bufferWei, dec, sym)}</span>
              </div>
              <div className="flex justify-between items-baseline border-t border-border/60 pt-2.5">
                <span className="font-semibold text-sm">Total deposit</span>
                <span className={`font-bold text-base tabular-nums ${hasError ? "text-red-400" : "text-primary"}`}>
                  {fmtWei(depositWei, dec, sym)}
                </span>
              </div>
            </div>

            {estimatedEndDate && (
              <div className="flex items-start gap-2.5 rounded-lg bg-primary/8 border border-primary/15 px-3 py-2.5">
                <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground leading-none mb-0.5">Stream ends</p>
                  <p className="text-sm font-semibold text-primary">{fmtDateShort(estimatedEndDate)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {estimatedEndDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            )}

            {tokenBalance !== undefined && (
              <div className={`flex justify-between items-baseline text-sm border-t border-border/40 pt-3 ${hasInsufficientBalance ? "text-red-400" : "text-muted-foreground"}`}>
                <span>Your balance</span>
                <span className="tabular-nums font-medium">
                  {fmtWei(tokenBalance, dec, sym)}{hasInsufficientBalance && " ⚠"}
                </span>
              </div>
            )}

            {/* High buffer warning */}
            {bufferPct > 20 && totalAmountWei > 0n && !isBusy && (
              <div className="flex items-start gap-2 rounded-lg border border-orange-500/25 bg-orange-500/5 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-400 leading-relaxed">
                  The Superfluid buffer is <span className="font-semibold">{bufferPct}% of your stream amount</span>.
                  For short or fast streams this can be large, but it is <span className="font-semibold">fully refunded</span> when the stream ends.
                </p>
              </div>
            )}

            {/* Approval notice */}
            {needsApproval && !isBusy && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400 leading-relaxed">
                  Two wallet confirmations: first to approve {sym}, then to create the stream.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Errors */}
      {hasInsufficientBalance && depositWei > 0n && (
        <div className="flex gap-2 rounded-lg border border-red-500/25 bg-red-500/8 p-3 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Insufficient balance — you need {fmtWei(depositWei, dec, sym)}.
        </div>
      )}
      {zeroRateIndices.length > 0 && (
        <div className="flex gap-2 rounded-lg border border-red-500/25 bg-red-500/8 p-3 text-xs text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Recipient{zeroRateIndices.length > 1 ? "s" : ""}{" "}
          {zeroRateIndices.map((i) => i + 1).join(", ")}: amount too small for this cadence.
        </div>
      )}

      {bufferPct > 0 && bufferPct <= 20 && !isBusy && (
        <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
          The Superfluid buffer is a protocol deposit returned in full when the stream ends or is cancelled.
        </p>
      )}

      {/* CTA — desktop only */}
      <div className="hidden lg:block space-y-2">
        <Button
          type="button" className="w-full" size="lg"
          onClick={onAction}
          disabled={isBusy || !isReady}
        >
          {isBusy ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{phaseLabel(phase, sym, needsApproval)}</>
          ) : isReady ? (
            <><CheckCircle className="h-4 w-4 mr-2" />Deposit &amp; Stream</>
          ) : (
            <>Fill in the form above</>
          )}
        </Button>

        {/* Deposit amount sub-label */}
        {isReady && !isBusy && (
          <p className="text-center text-xs text-muted-foreground">
            {needsApproval
              ? `Approve ${sym} then deposit ${fmtWei(depositWei, dec, sym)}`
              : `${fmtWei(depositWei, dec, sym)} will be deposited`}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Mobile bottom bar ────────────────────────────────────────────────────────

function MobileBottomBar({
  tokenMeta, tokenBalance, totalAmountWei, depositWei,
  needsApproval, hasInsufficientBalance, zeroRateIndices,
  phase, onAction, canSubmit,
}: Omit<SummaryProps, "estimatedEndDate">) {
  const [expanded, setExpanded] = useState(false);
  const sym = tokenMeta?.symbol ?? "—";
  const dec = tokenMeta?.decimals ?? 18;
  const bufferWei = depositWei > totalAmountWei ? depositWei - totalAmountWei : 0n;
  const isBusy    = phase !== "idle";
  const hasError  = hasInsufficientBalance || zeroRateIndices.length > 0;
  const isReady   = canSubmit && !hasError && depositWei > 0n;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 lg:hidden">
      {expanded && (
        <div className="border-t border-border bg-card/95 backdrop-blur-xl px-4 py-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stream amount</span>
            <span className="tabular-nums font-medium">{fmtWei(totalAmountWei, dec, sym)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Buffer (refunded)</span>
            <span className="text-amber-400 tabular-nums">{fmtWei(bufferWei, dec, sym)}</span>
          </div>
          {tokenBalance !== undefined && (
            <div className={`flex justify-between text-sm ${hasInsufficientBalance ? "text-red-400" : "text-muted-foreground"}`}>
              <span>Your balance</span>
              <span className="tabular-nums">{fmtWei(tokenBalance, dec, sym)}</span>
            </div>
          )}
          {needsApproval && (
            <p className="text-[11px] text-amber-400 pt-1">
              Two wallet confirmations required: approve {sym}, then create stream.
            </p>
          )}
        </div>
      )}

      <div className="border-t border-border bg-card/95 backdrop-blur-xl px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex flex-col items-start flex-1 min-w-0"
        >
          <span className="text-[11px] text-muted-foreground">Total deposit</span>
          <span className={`text-base font-bold tabular-nums leading-tight ${hasError ? "text-red-400" : "text-primary"}`}>
            {depositWei > 0n ? fmtWei(depositWei, dec, sym) : "—"}
          </span>
        </button>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${expanded ? "rotate-180" : ""}`} />

        <Button
          type="button" size="sm"
          onClick={onAction}
          disabled={isBusy || !isReady}
          className="shrink-0"
        >
          {isBusy
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : "Deposit & Stream"}
        </Button>
      </div>
    </div>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function CreateStreamForm() {
  const { address, isConnected } = useAccount();
  const chainId      = useChainId();
  const router       = useRouter();
  const publicClient = usePublicClient();
  const dripV4Addr   = getContractAddress(chainId, "DripV4");

  const { approveToken, createStream } = useCreateDripV4Stream();

  // Single phase state drives all UI
  const [phase,         setPhase]         = useState<TxPhase>("idle");
  // Track whether approval was triggered in this session (for phase label)
  const [didApprove,    setDidApprove]    = useState(false);

  // Phone resolution
  const [recipientInputs,   setRecipientInputs]   = useState<Record<number, string>>({});
  const [resolvedFromPhone, setResolvedFromPhone] = useState<Record<number, string | null>>({});
  const [phoneNotFound,     setPhoneNotFound]     = useState<Record<number, boolean>>({});
  const [resolvingPhone,    setResolvingPhone]     = useState<Record<number, boolean>>({});
  const inputsRef = useRef<Record<number, string>>({});
  const cacheRef  = useRef<Record<string, `0x${string}` | null>>({});
  const { resolveAddressByPhoneHash } = usePhoneMapping();

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(streamSchema),
    defaultValues: {
      recipients:   [{ address: "", amountPerPeriod: "" }],
      token:        "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
      cadence:      "monthly",
      totalPeriods: "12",
      title: "", description: "",
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "recipients" });
  const watchAll       = watch();
  const watchedToken   = watch("token");
  const watchedCadence = watch("cadence");
  const watchedPeriods = watch("totalPeriods");
  const watchedRecips  = watch("recipients");

  // ── Live calculations ────────────────────────────────────────────────────────
  const { flowRates, totalAmountWei, totalFlowRateWei, depositWei, zeroRateIndices } = useMemo(() => {
    const token = getTokenByAddress(watchedToken as `0x${string}`, chainId);
    if (!token) return { flowRates: [], totalAmountWei: 0n, totalFlowRateWei: 0n, depositWei: 0n, zeroRateIndices: [] };

    const cadenceSec = BigInt(CADENCE_SECONDS[watchedCadence] ?? 2_592_000);
    const periods    = BigInt(Math.max(1, parseInt(watchedPeriods || "1") || 1));
    const rates: bigint[] = [];
    const zeros: number[] = [];
    let totalRate = 0n, totalAmount = 0n;

    watchedRecips.forEach((r, i) => {
      const amt = parseFloat(r.amountPerPeriod || "0");
      if (!isNaN(amt) && amt > 0) {
        const amtWei = parseUnits(amt.toFixed(token.decimals), token.decimals);
        const rate   = amtWei / cadenceSec;
        rates.push(rate);
        if (rate === 0n) zeros.push(i);
        totalRate   += rate;
        totalAmount += rate * cadenceSec * periods;
      } else {
        rates.push(0n);
      }
    });

    return {
      flowRates: rates,
      totalAmountWei:   totalAmount,
      totalFlowRateWei: totalRate,
      depositWei:       totalAmount + totalRate * BUFFER_SECONDS,
      zeroRateIndices:  zeros,
    };
  }, [watchedRecips, watchedToken, watchedCadence, watchedPeriods, chainId]);

  const estimatedEndDate = useMemo(() => {
    if (totalFlowRateWei === 0n) return null;
    const totalSecs = CADENCE_SECONDS[watchedCadence] * Math.max(1, parseInt(watchedPeriods || "1") || 1);
    return new Date(Date.now() + totalSecs * 1000);
  }, [watchedCadence, watchedPeriods, totalFlowRateWei]);

  // ── Token data ────────────────────────────────────────────────────────────────
  const isERC20 = watchedToken !== "0x0000000000000000000000000000000000000000";

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: watchedToken as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && dripV4Addr ? [address, dripV4Addr as `0x${string}`] : undefined,
    query: { enabled: isERC20 && !!address && !!dripV4Addr, refetchInterval: 10_000 },
  });

  const { data: tokenBalance } = useReadContract({
    address: watchedToken as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isERC20 && !!address, refetchInterval: 15_000 },
  });

  const tokenMeta              = getTokenByAddress(watchedToken as `0x${string}`, chainId);
  const needsApproval          = isERC20 && depositWei > 0n && allowance !== undefined && (allowance as bigint) < depositWei;
  const hasInsufficientBalance = isERC20 && tokenBalance !== undefined && (tokenBalance as bigint) < depositWei && depositWei > 0n;

  // ── Phone lookup ──────────────────────────────────────────────────────────────
  const handleRecipientInput = async (index: number, value: string) => {
    setRecipientInputs((p) => ({ ...p, [index]: value }));
    inputsRef.current[index] = value;
    const isAddr  = /^0x[a-fA-F0-9]{40}$/.test(value.trim());
    const isPhone = /^\+[1-9]\d{7,14}$/.test(value.trim());

    if (isAddr) {
      setValue(`recipients.${index}.address`, value.trim() as `0x${string}`, { shouldValidate: true });
      setResolvedFromPhone((p) => ({ ...p, [index]: null }));
      setPhoneNotFound((p) => ({ ...p, [index]: false }));
      setResolvingPhone((p) => ({ ...p, [index]: false }));
      return;
    }
    if (isPhone) {
      const hashed = hashPhoneE164(value.trim());
      if (!hashed) { setPhoneNotFound((p) => ({ ...p, [index]: true })); return; }
      setResolvingPhone((p) => ({ ...p, [index]: true }));
      setPhoneNotFound((p) => ({ ...p, [index]: false }));
      const key = hashed.hash.toLowerCase();
      let mapped = cacheRef.current[key] ?? null;
      if (!(key in cacheRef.current)) { mapped = await resolveAddressByPhoneHash(hashed.hash); cacheRef.current[key] = mapped; }
      if (inputsRef.current[index] !== value) return;
      setResolvingPhone((p) => ({ ...p, [index]: false }));
      if (mapped) {
        setValue(`recipients.${index}.address`, mapped, { shouldValidate: true });
        setResolvedFromPhone((p) => ({ ...p, [index]: hashed.normalized }));
      } else {
        setValue(`recipients.${index}.address`, "" as any);
        setPhoneNotFound((p) => ({ ...p, [index]: true }));
      }
      return;
    }
    setValue(`recipients.${index}.address`, "" as any);
    setResolvedFromPhone((p) => ({ ...p, [index]: null }));
    setPhoneNotFound((p) => ({ ...p, [index]: false }));
    setResolvingPhone((p) => ({ ...p, [index]: false }));
  };

  // ── Single unified action: approve (if needed) → create ───────────────────────
  const doDepositAndStream = async (data: FormData) => {
    if (!isConnected || !address) { toast.error("Connect your wallet"); return; }
    if (depositWei === 0n)        { toast.error("Enter amounts above"); return; }
    if (hasInsufficientBalance)   { toast.error("Insufficient balance"); return; }
    if (zeroRateIndices.length)   {
      toast.error(`Amount too small for cadence — recipient(s) ${zeroRateIndices.map(i => i + 1).join(", ")}`);
      return;
    }

    const sym = tokenMeta?.symbol ?? "token";
    const willApprove = needsApproval; // snapshot before any state change
    setDidApprove(false);

    try {
      // ── Step 1: Approve (only if needed) ──────────────────────────────────────
      if (willApprove) {
        setPhase("approving");
        toast.loading(`Step 1/2 — Approve ${sym} in your wallet`, { id: "stream-flow" });

        const approveHash = await approveToken(data.token as `0x${string}`, maxUint256);

        setPhase("waitApprove");
        toast.loading(`Step 1/2 — Waiting for ${sym} approval…`, { id: "stream-flow" });

        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
        setDidApprove(true);

        // Refresh allowance cache (fire-and-forget — we proceed regardless)
        refetchAllowance().catch(() => {});

        toast.loading("Step 1/2 — Approved! Now create the stream…", { id: "stream-flow" });
        // Brief pause so the "Approved!" message is visible
        await new Promise((r) => setTimeout(r, 800));
      }

      // ── Step 2: Create stream ─────────────────────────────────────────────────
      setPhase("creating");
      const stepLabel = willApprove ? "Step 2/2" : "";
      toast.loading(`${stepLabel} Confirm stream creation in your wallet`, { id: "stream-flow" });

      const createHash = await createStream({
        recipients:  data.recipients.map((r) => r.address as `0x${string}`),
        token:       data.token as `0x${string}`,
        flowRates,
        totalAmount: totalAmountWei,
        title:       data.title || "",
        description: data.description || "",
      });

      setPhase("waitCreate");
      toast.loading(`${stepLabel} Confirming stream on-chain…`, { id: "stream-flow" });

      await publicClient!.waitForTransactionReceipt({ hash: createHash });

      toast.success("Stream created! Redirecting…", { id: "stream-flow" });
      router.push("/streams");

    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Transaction failed";
      toast.error(msg, { id: "stream-flow" });
      setPhase("idle");
      setDidApprove(false);
    }
  };

  const onActionClick = () => handleSubmit(doDepositAndStream)();

  // ── Shared summary props ──────────────────────────────────────────────────────
  const summaryProps = {
    tokenMeta,
    tokenBalance:         tokenBalance as bigint | undefined,
    totalAmountWei,
    depositWei,
    estimatedEndDate,
    needsApproval,
    hasInsufficientBalance,
    zeroRateIndices,
    phase,
    onAction:  onActionClick,
    canSubmit: isConnected,
  };

  if (!isConnected) {
    return (
      <div className="glass-card rounded-xl border border-border p-12 text-center">
        <p className="text-muted-foreground">Connect your wallet to create a stream.</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 pb-32 lg:pb-0 items-start">

        {/* ── Left: glass form card ── */}
        <div className="glass-card rounded-xl border border-white/8 p-6 lg:p-8 space-y-8">

          {/* Tx progress indicator — shown while a tx is in flight */}
          {phase !== "idle" && (
            <TxProgressPill phase={phase} sym={tokenMeta?.symbol ?? "token"} />
          )}

          <form onSubmit={handleSubmit(doDepositAndStream)} className="space-y-8">

            {/* ─ 1. Details ─ */}
            <div>
              <SectionHeader icon={Coins} title="Stream details" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-sm font-medium">Stream name</Label>
                  <Input
                    id="title" placeholder="e.g. Team Salary — Engineering"
                    maxLength={120} className="bg-background/60"
                    {...register("title")}
                  />
                  {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description" className="text-sm font-medium">
                    Description <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id="description" placeholder="What is this for?"
                    maxLength={200} className="bg-background/60"
                    {...register("description")}
                  />
                </div>
              </div>
            </div>

            {/* ─ 2. Token & schedule ─ */}
            <div>
              <SectionHeader icon={Calendar} title="Token & schedule" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Token</Label>
                  <TokenSelector
                    value={watchedToken as `0x${string}`}
                    onValueChange={(v) => setValue("token", v)}
                  />
                  {errors.token && <p className="text-xs text-destructive">{errors.token.message}</p>}
                  {isERC20 && tokenBalance !== undefined && (
                    <p className={`text-xs ${hasInsufficientBalance ? "text-red-400" : "text-muted-foreground"}`}>
                      Balance:{" "}
                      <span className="font-medium tabular-nums">
                        {parseFloat(formatUnits(tokenBalance as bigint, tokenMeta?.decimals ?? 18)).toFixed(4)}
                      </span>{" "}
                      {tokenMeta?.symbol}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Cadence</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    {...register("cadence")}
                  >
                    {(Object.entries(CADENCE_LABEL) as [CadenceKey, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="totalPeriods" className="text-sm font-medium">Number of payments</Label>
                  <Input
                    id="totalPeriods" type="number" min="1" placeholder="12"
                    className="bg-background/60"
                    {...register("totalPeriods")}
                  />
                  {errors.totalPeriods && <p className="text-xs text-destructive">{errors.totalPeriods.message}</p>}
                </div>
              </div>

              {estimatedEndDate && totalFlowRateWei > 0n && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Stream runs until{" "}
                  <span className="text-foreground font-medium">{fmtDateFull(estimatedEndDate)}</span>
                  {" "}— then stops automatically and remaining funds are refunded.
                </p>
              )}
            </div>

            {/* ─ 3. Recipients ─ */}
            <div>
              <SectionHeader icon={Users} title="Recipients" />

              <div className="space-y-2">
                {/* Column labels */}
                <div className="hidden sm:grid sm:grid-cols-[1fr_180px_32px] gap-3 px-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Address or phone
                  </p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Amount / {CADENCE_SHORT[watchedCadence]}
                  </p>
                  <span />
                </div>

                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_180px_32px] gap-3 items-start p-3 rounded-lg border border-border/50 bg-background/30"
                  >
                    {/* Address / phone */}
                    <div className="space-y-1">
                      <Input
                        placeholder="0x… wallet or +234… phone"
                        value={recipientInputs[index] ?? ""}
                        onChange={(e) => handleRecipientInput(index, e.target.value)}
                        className="bg-background/60"
                      />
                      <input type="hidden" {...register(`recipients.${index}.address`)} />
                      {resolvingPhone[index] && (
                        <p className="text-[11px] text-blue-400 flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Resolving on-chain…
                        </p>
                      )}
                      {resolvedFromPhone[index] && (
                        <p className="text-[11px] text-emerald-500">
                          ✓ {resolvedFromPhone[index]} →{" "}
                          <span className="font-mono">
                            {watchAll.recipients[index]?.address?.slice(0, 6)}…
                            {watchAll.recipients[index]?.address?.slice(-4)}
                          </span>
                        </p>
                      )}
                      {phoneNotFound[index] && (
                        <p className="text-[11px] text-amber-400">⚠ No address mapping found</p>
                      )}
                      {errors.recipients?.[index]?.address && !resolvedFromPhone[index] && !phoneNotFound[index] && (
                        <p className="text-[11px] text-destructive">{errors.recipients[index]?.address?.message}</p>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="space-y-1">
                      <div className="relative">
                        <Input
                          type="number" step="0.000001" placeholder="0.00"
                          className="bg-background/60 pr-16"
                          {...register(`recipients.${index}.amountPerPeriod`)}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                          {tokenMeta?.symbol ?? "tkn"}/{CADENCE_SHORT[watchedCadence]}
                        </span>
                      </div>
                      {flowRates[index] === 0n
                        && watchAll.recipients[index]?.amountPerPeriod
                        && parseFloat(watchAll.recipients[index].amountPerPeriod) > 0 && (
                        <p className="text-[11px] text-red-400">Amount too small — rounds to 0</p>
                      )}
                      {errors.recipients?.[index]?.amountPerPeriod && (
                        <p className="text-[11px] text-destructive">{errors.recipients[index]?.amountPerPeriod?.message}</p>
                      )}
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      className="flex items-center justify-center w-8 h-8 mt-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-25 disabled:pointer-events-none"
                      aria-label="Remove recipient"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => append({ address: "", amountPerPeriod: "" })}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors px-1 py-1.5"
                >
                  <Plus className="h-4 w-4" /> Add another recipient
                </button>
              </div>
            </div>

          </form>
        </div>

        {/* ── Right: sticky summary ── */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <SummaryCard {...summaryProps} />
          </div>
        </div>
      </div>

      {/* ── Mobile bottom bar ── */}
      <MobileBottomBar {...summaryProps} />
    </>
  );
}
