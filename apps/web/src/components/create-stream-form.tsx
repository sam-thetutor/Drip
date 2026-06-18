"use client";

import { useState, useRef, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAccount, useChainId, useReadContract, usePublicClient } from "wagmi";
import { erc20Abi, parseUnits, formatUnits, maxUint256 } from "viem";
import { useCreateDripV4Stream, useUsdcSwapQuote } from "@/lib/contracts/hooks/useDripV4";
import { getContractAddress } from "@/lib/contracts/config";
import { TokenSelector, getTokenByAddress } from "@/components/token-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus, X, Loader2, CheckCircle, AlertTriangle,
  ChevronDown, Calendar, Coins, Users, Wallet, Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { usePhoneMapping } from "@/lib/contracts";
import { hashPhoneE164 } from "@/lib/phone/hash";
import { useSearchParams } from "next/navigation";

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

// USDC on Celo (plain ERC20 — not streamable directly, so it funds G$ streams via swap)
const USDC_ADDRESS  = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`;
const USDC_DECIMALS = 6;
const GD_ADDRESS    = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as `0x${string}`;

type FundWith = "GD" | "USDC";

// ─── Tx phase ─────────────────────────────────────────────────────────────────

type TxPhase = "idle" | "approving" | "waitApprove" | "creating" | "waitCreate";

function phaseLabel(phase: TxPhase, sym: string, needsApprove: boolean): string {
  switch (phase) {
    case "approving":    return `Approve ${sym} in wallet · step 1 of 2`;
    case "waitApprove":  return `Waiting for ${sym} approval · step 1 of 2`;
    case "creating":     return needsApprove ? "Confirm plan in wallet · step 2 of 2" : "Confirm plan in wallet…";
    case "waitCreate":   return needsApprove ? "Starting plan on-chain · step 2 of 2" : "Starting plan on-chain…";
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

// ─── Duration hint helper ──────────────────────────────────────────────────────

function humanDuration(cadence: CadenceKey, n: number): string {
  if (!n || n <= 0) return "";
  const totalSecs = CADENCE_SECONDS[cadence] * n;
  const years  = totalSecs / (365.25 * 86400);
  const months = totalSecs / 2_592_000;
  const weeks  = totalSecs / 604_800;
  const days   = totalSecs / 86_400;
  const hours  = totalSecs / 3_600;
  const mins   = totalSecs / 60;
  if (years   >= 0.95) return `≈ ${Math.round(years  * 10) / 10} year${years  >= 1.95 ? "s" : ""}`;
  if (months  >= 0.9)  return `≈ ${Math.round(months)} month${Math.round(months) !== 1 ? "s" : ""}`;
  if (weeks   >= 0.9)  return `≈ ${Math.round(weeks)} week${Math.round(weeks) !== 1 ? "s" : ""}`;
  if (days    >= 0.9)  return `≈ ${Math.round(days)} day${Math.round(days) !== 1 ? "s" : ""}`;
  if (hours   >= 0.9)  return `≈ ${Math.round(hours)} hour${Math.round(hours) !== 1 ? "s" : ""}`;
  return `≈ ${Math.round(mins)} min${Math.round(mins) !== 1 ? "s" : ""}`;
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
    { key: "create",  label: "Start plan",     done: phase === "waitCreate" },
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
          <span className="text-sm text-muted-foreground">Start plan</span>
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
            <span className="font-medium text-primary">Start plan</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

interface SwapInfo {
  usdcIn: bigint;
  maxUsdcIn: bigint;
  loading: boolean;
  error: boolean;
}

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
  fundingSymbol: string;
  fundingDecimals: number;
  fundingBalance: bigint | undefined;
  swap: SwapInfo | null;
}

function SummaryCard({
  tokenMeta, tokenBalance, totalAmountWei, depositWei,
  estimatedEndDate, needsApproval, hasInsufficientBalance,
  zeroRateIndices, phase, onAction, canSubmit, fundingSymbol, fundingDecimals, fundingBalance, swap,
}: SummaryProps) {
  const sym = tokenMeta?.symbol ?? "—";
  const dec = tokenMeta?.decimals ?? 18;
  const bufferWei = depositWei > totalAmountWei ? depositWei - totalAmountWei : 0n;
  const bufferPct = totalAmountWei > 0n ? Math.round(Number((bufferWei * 100n) / totalAmountWei)) : 0;
  const isBusy    = phase !== "idle";
  const hasError  = hasInsufficientBalance || zeroRateIndices.length > 0;
  const swapBlocked = swap ? (swap.loading || swap.error || swap.maxUsdcIn === 0n) : false;
  const isReady   = canSubmit && !hasError && depositWei > 0n && !swapBlocked;
  const usdcFmt = (wei: bigint) => `${parseFloat(formatUnits(wei, USDC_DECIMALS)).toFixed(2)} USDC`;

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
                <span className="text-muted-foreground">Total amount</span>
                <span className="font-medium tabular-nums">{fmtWei(totalAmountWei, dec, sym)}</span>
              </div>
              <div className="flex justify-between items-baseline text-sm">
                <span className="text-muted-foreground">
                  Safety buffer
                  {bufferPct > 0 && <span className="ml-1 text-xs opacity-60">(returned on end)</span>}
                </span>
                <span className="text-amber-400 tabular-nums">+{fmtWei(bufferWei, dec, sym)}</span>
              </div>
              <div className="flex justify-between items-baseline border-t border-border/60 pt-2.5">
                <span className="font-semibold text-sm">Total to set aside</span>
                <span className={`font-bold text-base tabular-nums ${hasError ? "text-red-400" : "text-primary"}`}>
                  {fmtWei(depositWei, dec, sym)}
                </span>
              </div>

              {/* USDC funding line — when paying with USDC via swap */}
              {swap && (
                <div className="flex justify-between items-baseline rounded-lg bg-blue-500/8 border border-blue-500/15 px-3 py-2 mt-1">
                  <span className="flex items-center gap-1.5 text-sm text-blue-300">
                    <Repeat className="h-3.5 w-3.5" /> You pay (auto-swap)
                  </span>
                  {swap.loading ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> quoting…
                    </span>
                  ) : swap.error || swap.usdcIn === 0n ? (
                    <span className="text-xs text-red-400">quote unavailable</span>
                  ) : (
                    <span className="font-bold text-sm tabular-nums text-blue-300">≈ {usdcFmt(swap.usdcIn)}</span>
                  )}
                </div>
              )}
            </div>

            {estimatedEndDate && (
              <div className="flex items-start gap-2.5 rounded-lg bg-primary/8 border border-primary/15 px-3 py-2.5">
                <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground leading-none mb-0.5">Plan ends</p>
                  <p className="text-sm font-semibold text-primary">{fmtDateShort(estimatedEndDate)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {estimatedEndDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            )}

            {(swap ? fundingBalance : tokenBalance) !== undefined && (
              <div className={`flex justify-between items-baseline text-sm border-t border-border/40 pt-3 ${hasInsufficientBalance ? "text-red-400" : "text-muted-foreground"}`}>
                <span>Your {fundingSymbol} balance</span>
                <span className="tabular-nums font-medium">
                  {swap
                    ? fmtWei(fundingBalance ?? 0n, fundingDecimals, fundingSymbol, 2)
                    : fmtWei(tokenBalance ?? 0n, dec, sym)}
                  {hasInsufficientBalance && " ⚠"}
                </span>
              </div>
            )}

            {/* High buffer warning */}
            {bufferPct > 20 && totalAmountWei > 0n && !isBusy && (
              <div className="flex items-start gap-2 rounded-lg border border-orange-500/25 bg-orange-500/5 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-400 leading-relaxed">
                  The safety buffer is <span className="font-semibold">{bufferPct}% of the payout amount</span>.
                  This is common for short plans — it is <span className="font-semibold">fully returned</span> when the plan ends.
                </p>
              </div>
            )}

            {/* Approval notice */}
            {needsApproval && !isBusy && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400 leading-relaxed">
                  Two steps required: first approve {fundingSymbol}, then start the plan.
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
          Insufficient {fundingSymbol} balance
          {swap && swap.maxUsdcIn > 0n ? ` — you need ≈ ${usdcFmt(swap.maxUsdcIn)}.` : ` — you need ${fmtWei(depositWei, dec, sym)}.`}
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
            The safety buffer is a protocol requirement — it's returned in full when the plan ends or is cancelled.
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
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{phaseLabel(phase, fundingSymbol, needsApproval)}</>
          ) : isReady ? (
            <><CheckCircle className="h-4 w-4 mr-2" />{swap ? "Swap, set aside & start plan" : "Set aside & start plan"}</>
          ) : (
            <>Fill in the form above</>
          )}
        </Button>

        {/* Deposit amount sub-label */}
        {isReady && !isBusy && (
          <p className="text-center text-xs text-muted-foreground">
          {swap && swap.usdcIn > 0n
              ? `≈ ${usdcFmt(swap.usdcIn)} swapped to ${fmtWei(depositWei, dec, sym)} of G$`
              : needsApproval
              ? `Approve ${fundingSymbol}, then set aside ${fmtWei(depositWei, dec, sym)} to start`
              : `${fmtWei(depositWei, dec, sym)} set aside for this plan`}
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
  phase, onAction, canSubmit, fundingSymbol, swap,
}: Omit<SummaryProps, "estimatedEndDate">) {
  const [expanded, setExpanded] = useState(false);
  const sym = tokenMeta?.symbol ?? "—";
  const dec = tokenMeta?.decimals ?? 18;
  const bufferWei = depositWei > totalAmountWei ? depositWei - totalAmountWei : 0n;
  const isBusy    = phase !== "idle";
  const hasError  = hasInsufficientBalance || zeroRateIndices.length > 0;
  const swapBlocked = swap ? (swap.loading || swap.error || swap.maxUsdcIn === 0n) : false;
  const isReady   = canSubmit && !hasError && depositWei > 0n && !swapBlocked;
  const usdcFmt = (wei: bigint) => `${parseFloat(formatUnits(wei, USDC_DECIMALS)).toFixed(2)} USDC`;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-50 lg:hidden">
      {expanded && (
        <div className="border-t border-border bg-card/95 backdrop-blur-xl px-4 py-4 space-y-2.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total amount</span>
            <span className="tabular-nums font-medium">{fmtWei(totalAmountWei, dec, sym)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Safety buffer (returned)</span>
            <span className="text-amber-400 tabular-nums">{fmtWei(bufferWei, dec, sym)}</span>
          </div>
          {tokenBalance !== undefined && (
            <div className={`flex justify-between text-sm ${hasInsufficientBalance ? "text-red-400" : "text-muted-foreground"}`}>
              <span>Your balance</span>
              <span className="tabular-nums">{fmtWei(tokenBalance, dec, sym)}</span>
            </div>
          )}
          {swap && swap.usdcIn > 0n && (
            <div className="flex justify-between text-sm text-blue-300">
              <span>You pay (auto-swap)</span>
              <span className="tabular-nums">≈ {usdcFmt(swap.usdcIn)}</span>
            </div>
          )}
          {needsApproval && (
            <p className="text-[11px] text-amber-400 pt-1">
              Two steps: approve {fundingSymbol}, then start the plan.
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
          <span className="text-[11px] text-muted-foreground">{swap ? "You pay" : "Total to set aside"}</span>
          <span className={`text-base font-bold tabular-nums leading-tight ${hasError ? "text-red-400" : "text-primary"}`}>
            {swap
              ? (swap.usdcIn > 0n ? usdcFmt(swap.usdcIn) : "—")
              : (depositWei > 0n ? fmtWei(depositWei, dec, sym) : "—")}
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
            : "Set up plan"}
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
  const searchParams = useSearchParams();

  // Pre-fill recipient from ?recipient= query param (set by QR code share link)
  const prefillRecipient = searchParams.get("recipient") ?? "";

  const { approveToken, createStream, createStreamWithSwap } = useCreateDripV4Stream();

  // Single phase state drives all UI
  const [phase,         setPhase]         = useState<TxPhase>("idle");
  // Track whether approval was triggered in this session (for phase label)
  const [didApprove,    setDidApprove]    = useState(false);
  // Funding source: stream is always G$; pay with G$ directly or USDC (auto-swap)
  const [fundWith,      setFundWith]      = useState<FundWith>("GD");

  // Phone resolution
  const [recipientInputs,   setRecipientInputs]   = useState<Record<number, string>>(
    prefillRecipient ? { 0: prefillRecipient } : {}
  );
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
      recipients:   [{ address: prefillRecipient.match(/^0x[a-fA-F0-9]{40}$/) ? prefillRecipient : "", amountPerPeriod: "" }],
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

  // ── USDC swap funding ──────────────────────────────────────────────────────
  // When paying with USDC, the contract swaps USDC → G$ for the full deposit (depositWei).
  const usingSwap = fundWith === "USDC";
  const neededGd  = usingSwap ? depositWei : 0n;
  const { usdcIn, maxUsdcIn, isLoading: quoteLoading, isError: quoteError } = useUsdcSwapQuote(neededGd);

  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && dripV4Addr ? [address, dripV4Addr as `0x${string}`] : undefined,
    query: { enabled: usingSwap && !!address && !!dripV4Addr, refetchInterval: 10_000 },
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: usingSwap && !!address, refetchInterval: 15_000 },
  });

  const swapInfo: SwapInfo | null = usingSwap
    ? { usdcIn, maxUsdcIn, loading: quoteLoading, error: quoteError }
    : null;

  const fundingSymbol   = usingSwap ? "USDC" : (tokenMeta?.symbol ?? "G$");
  const fundingDecimals = usingSwap ? USDC_DECIMALS : (tokenMeta?.decimals ?? 18);

  const needsApproval = usingSwap
    ? (maxUsdcIn > 0n && usdcAllowance !== undefined && (usdcAllowance as bigint) < maxUsdcIn)
    : (isERC20 && depositWei > 0n && allowance !== undefined && (allowance as bigint) < depositWei);

  const hasInsufficientBalance = usingSwap
    ? (usdcBalance !== undefined && maxUsdcIn > 0n && (usdcBalance as bigint) < maxUsdcIn)
    : (isERC20 && tokenBalance !== undefined && (tokenBalance as bigint) < depositWei && depositWei > 0n);

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

    if (usingSwap && (maxUsdcIn === 0n || quoteError)) {
      toast.error("Couldn't fetch a swap quote — try again in a moment");
      return;
    }

    const sym = fundingSymbol;
    const fundingTokenAddr = usingSwap ? USDC_ADDRESS : (data.token as `0x${string}`);
    const willApprove = needsApproval; // snapshot before any state change
    setDidApprove(false);

    try {
      // ── Step 1: Approve (only if needed) ──────────────────────────────────────
      if (willApprove) {
        setPhase("approving");
        toast.loading(`Step 1/2 — Approve ${sym} in your wallet`, { id: "stream-flow" });

        const approveHash = await approveToken(fundingTokenAddr, maxUint256);

        setPhase("waitApprove");
        toast.loading(`Step 1/2 — Waiting for ${sym} approval…`, { id: "stream-flow" });

        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
        setDidApprove(true);

        // Refresh allowance cache (fire-and-forget — we proceed regardless)
        (usingSwap ? refetchUsdcAllowance() : refetchAllowance()).catch(() => {});

        toast.loading("Approved! Now confirm the stream…", { id: "stream-flow" });
        // Brief pause so the "Approved!" message is visible
        await new Promise((r) => setTimeout(r, 800));
      }

      // ── Step 2: Create stream ─────────────────────────────────────────────────
      setPhase("creating");
      const stepLabel = willApprove ? "Step 2/2" : "";
      toast.loading(
        usingSwap
          ? `${stepLabel} Confirm swap & plan in your wallet`
          : `${stepLabel} Confirm your plan in your wallet`,
        { id: "stream-flow" },
      );

      const recipients = data.recipients.map((r) => r.address as `0x${string}`);
      const createHash = usingSwap
        ? await createStreamWithSwap({
            maxAmountIn: maxUsdcIn,
            recipients,
            flowRates,
            totalAmount: totalAmountWei,
            title:       data.title || "",
            description: data.description || "",
          })
        : await createStream({
            recipients,
            token:       data.token as `0x${string}`,
            flowRates,
            totalAmount: totalAmountWei,
            title:       data.title || "",
            description: data.description || "",
          });

      setPhase("waitCreate");
      toast.loading(`${stepLabel} Setting up your plan on-chain…`, { id: "stream-flow" });

      await publicClient!.waitForTransactionReceipt({ hash: createHash });

      toast.success("Your plan is live! Redirecting…", { id: "stream-flow" });
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
    fundingSymbol,
    fundingDecimals,
    fundingBalance: usingSwap ? (usdcBalance as bigint | undefined) : (tokenBalance as bigint | undefined),
    swap: swapInfo,
  };

  if (!isConnected) {
    return (
      <div className="glass-card rounded-xl border border-border p-12 text-center">
        <p className="text-muted-foreground">Connect your wallet to set up a plan.</p>
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

          {/* Pre-fill banner — shown when opened via QR/share link */}
          {prefillRecipient.match(/^0x[a-fA-F0-9]{40}$/) && (
            <div className="flex items-start gap-3 rounded-xl bg-primary/8 border border-primary/20 px-4 py-3">
              <span className="text-lg">📩</span>
              <div>
                <p className="text-sm font-medium text-primary">Payment request</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Someone sent you this link to request a plan. Their address has been pre-filled as a bucket —
                  just set the amount and start.
                </p>
                <p className="font-mono text-xs text-foreground/60 mt-1">
                  {prefillRecipient.slice(0, 8)}…{prefillRecipient.slice(-6)}
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit(doDepositAndStream)} className="space-y-8">

            {/* ─ 1. Details ─ */}
            <div>
              <SectionHeader icon={Coins} title="About this plan" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title" className="text-sm font-medium">Plan name</Label>
                  <Input
                    id="title" placeholder="e.g. Monthly savings, Rent, Send to Mum"
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
              <SectionHeader icon={Calendar} title="Schedule" />
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
                  <Label className="text-sm font-medium">Pay every</Label>
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
                  <Label htmlFor="totalPeriods" className="text-sm font-medium">How many times</Label>
                  <Input
                    id="totalPeriods" type="number" min="1" placeholder="12"
                    className="bg-background/60"
                    {...register("totalPeriods")}
                  />
                  {errors.totalPeriods && <p className="text-xs text-destructive">{errors.totalPeriods.message}</p>}
                  {!errors.totalPeriods && watchedPeriods && parseInt(watchedPeriods) > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {parseInt(watchedPeriods)} × {CADENCE_LABEL[watchedCadence].toLowerCase()} = {humanDuration(watchedCadence, parseInt(watchedPeriods))}
                    </p>
                  )}
                </div>
              </div>

              {estimatedEndDate && totalFlowRateWei > 0n && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Plan ends{" "}
                  <span className="text-foreground font-medium">{fmtDateFull(estimatedEndDate)}</span>
                  {" "}— then stops automatically and any unused safety buffer is returned.
                </p>
              )}

              {/* ─ Pay with ─ recipients always receive G$; pick how you fund it ─ */}
              <div className="mt-5 space-y-2">
                <Label className="text-sm font-medium">Pay with</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFundWith("GD")}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      fundWith === "GD"
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-background/40 hover:border-border/80"
                    }`}
                  >
                    <Wallet className={`h-4 w-4 shrink-0 ${fundWith === "GD" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">G$ balance</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">Fund directly</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundWith("USDC")}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      fundWith === "USDC"
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-background/40 hover:border-border/80"
                    }`}
                  >
                    <Repeat className={`h-4 w-4 shrink-0 ${fundWith === "USDC" ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">USDC</p>
                      <p className="text-[11px] text-muted-foreground leading-tight">Auto-swap to G$</p>
                    </div>
                  </button>
                </div>
                {usingSwap && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Your recipients still receive <span className="font-medium text-foreground">G$</span>.
                    We swap your USDC to G$ on Uniswap at stream creation and refund any unused USDC.
                  </p>
                )}
              </div>
            </div>

            {/* ─ 3. Recipients ─ */}
            <div>
              <SectionHeader icon={Users} title="Buckets — where the money goes" />

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
                      {/* Self-send warning */}
                      {watchAll.recipients[index]?.address &&
                       address &&
                       watchAll.recipients[index].address.toLowerCase() === address.toLowerCase() && (
                        <p className="text-[11px] text-amber-400">⚠ This is your own address — are you sure?</p>
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
                        <p className="text-[11px] text-red-400">Amount too small for this cadence — try a larger value</p>
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
                      aria-label="Remove bucket"
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
                  <Plus className="h-4 w-4" /> Add another bucket
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
