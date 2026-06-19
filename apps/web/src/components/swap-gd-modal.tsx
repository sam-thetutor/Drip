"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  useChainId,
  useBalance,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  X,
  ArrowRight,
  Loader2,
  CheckCircle2,
  RefreshCw,
  ArrowDownLeft,
} from "lucide-react";
import { parseUnits, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";
import { useRefetchBalances } from "@/lib/contracts/hooks/useRefetchBalances";

// ─── Uniswap V3 on Celo Mainnet ──────────────────────────────────────────────
// Verified on-chain Jun 2026:
//   factory    0xAfE208a311B21f13EF87E33A90049fC17A7acDEc
//   SwapRouter 0x5615CDAb10dc425a742d643d949a7F474C01abc4
//   Quoter V1  0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8
//   G$/cUSD    fee 10000 (1%)    0x9491d57c5687AB75726423B55AC2d87D1cDa2c3F ✓
//   cUSD/USDC  fee 100   (0.01%) 0x34757893070B0FC5de37AaF2844255fF90F7F1E0 ✓
const SWAP_ROUTER   = "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as const;
const QUOTER        = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as const;
const CUSD_ADDRESS  = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;

// Swap path: G$ →(10000)→ cUSD →(100)→ USDC
function buildSwapPath(gdAddr: string, usdcAddr: string): `0x${string}` {
  const s = (a: string) => a.slice(2).toLowerCase();
  return `0x${s(gdAddr)}002710${s(CUSD_ADDRESS)}000064${s(usdcAddr)}` as `0x${string}`;
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const ERC20_ABI = [
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }] },
] as const;

const QUOTER_ABI = [
  { name: "quoteExactInput", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "path", type: "bytes" }, { name: "amountIn", type: "uint256" }],
    outputs: [{ name: "amountOut", type: "uint256" }] },
] as const;

// SwapRouter02 on Celo — exactInput params have NO per-call deadline field
const SWAP_ROUTER_ABI = [
  { name: "exactInput", type: "function", stateMutability: "payable",
    inputs: [{ name: "params", type: "tuple", components: [
      { name: "path",             type: "bytes"   },
      { name: "recipient",        type: "address" },
      { name: "amountIn",         type: "uint256" },
      { name: "amountOutMinimum", type: "uint256" },
    ]}],
    outputs: [{ name: "amountOut", type: "uint256" }] },
] as const;

const USDC_DECIMALS = 6;
const GD_DECIMALS   = 18;
const SLIPPAGE_BPS  = 100n; // 1% slippage on live quote

type Step = "input" | "approve" | "approving" | "swap" | "swapping" | "done" | "error";

interface SwapGdModalProps {
  address: string;
  onClose: () => void;
  onSwapSuccess?: (usdcAmountFormatted: string) => void;
}

/** Simple hook that debounces a value by `delay` ms */
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SwapGdModal({ address, onClose, onSwapSuccess }: SwapGdModalProps) {
  const chainId = useChainId();
  const [gdInput, setGdInput]   = useState("");
  const [step, setStep]         = useState<Step>("input");
  const [errMsg, setErrMsg]     = useState("");
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>();
  const [swapHash, setSwapHash]       = useState<`0x${string}` | undefined>();

  const gdAddress   = getTokenAddressBySymbol("G$",   chainId);
  const usdcAddress = getTokenAddressBySymbol("USDC", chainId);

  const { data: gdBalance, isLoading: gdLoading } = useBalance({
    address: address as `0x${string}`,
    token:   gdAddress,
    query: { enabled: !!address && !!gdAddress, refetchInterval: 15_000 },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: gdAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, SWAP_ROUTER],
    query: { enabled: !!gdAddress && !!address },
  });

  const { writeContractAsync } = useWriteContract();
  const refetchBalances = useRefetchBalances();

  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash, query: { enabled: !!approveHash },
  });
  const { isSuccess: swapConfirmed } = useWaitForTransactionReceipt({
    hash: swapHash, query: { enabled: !!swapHash },
  });

  // ── Live quote from Uniswap V3 Quoter ─────────────────────────────────────
  const gdNum       = parseFloat(gdInput || "0");
  const gdFormatted = gdBalance ? parseFloat(formatUnits(gdBalance.value, GD_DECIMALS)) : 0;
  const amountInWei = gdNum > 0 ? parseUnits(gdInput, GD_DECIMALS) : 0n;

  const debouncedAmountIn = useDebounce(amountInWei, 400);

  const swapPath = useMemo(
    () => gdAddress && usdcAddress ? buildSwapPath(gdAddress, usdcAddress) : ("0x" as `0x${string}`),
    [gdAddress, usdcAddress],
  );

  const { data: quoteRaw, isLoading: quoteLoading, isError: quoteError } = useReadContract({
    address: QUOTER,
    abi: QUOTER_ABI,
    functionName: "quoteExactInput",
    args: [swapPath, debouncedAmountIn],
    query: {
      enabled: debouncedAmountIn > 0n && !!gdAddress && !!usdcAddress,
      retry: 1,
      staleTime: 10_000,
    },
  });

  const quoteWei: bigint    = (quoteRaw as bigint | undefined) ?? 0n;
  const quoteUsdc: number   = quoteWei > 0n ? Number(quoteWei) / 10 ** USDC_DECIMALS : 0;
  const quoteUsdcStr        = quoteUsdc > 0 ? quoteUsdc.toFixed(6) : "—";
  // amountOutMinimum = live quote minus 1% slippage
  const amountOutMin        = quoteWei > 0n ? quoteWei - (quoteWei * SLIPPAGE_BPS) / 10_000n : 0n;

  const needsApprove = allowance !== undefined && amountInWei > 0n && allowance < amountInWei;

  // Implied per-token price for display
  const impliedPrice = gdNum > 0 && quoteUsdc > 0 ? (quoteUsdc / gdNum).toFixed(8) : null;

  // ── Approve ────────────────────────────────────────────────────────────────
  const doApprove = useCallback(async () => {
    if (!gdAddress) return;
    setStep("approving");
    try {
      const hash = await writeContractAsync({
        address: gdAddress, abi: ERC20_ABI, functionName: "approve",
        args: [SWAP_ROUTER, amountInWei],
      });
      setApproveHash(hash);
    } catch (e: any) {
      setStep("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? "Approval failed");
    }
  }, [gdAddress, amountInWei, writeContractAsync]);

  // ── Swap ───────────────────────────────────────────────────────────────────
  const doSwap = useCallback(async () => {
    if (!address || amountOutMin === 0n) return;
    setStep("swapping");
    try {
      const hash = await writeContractAsync({
        address: SWAP_ROUTER, abi: SWAP_ROUTER_ABI, functionName: "exactInput",
        args: [{ path: swapPath, recipient: address as `0x${string}`, amountIn: amountInWei, amountOutMinimum: amountOutMin }],
      });
      setSwapHash(hash);
    } catch (e: any) {
      setStep("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? "Swap failed");
    }
  }, [address, swapPath, amountInWei, amountOutMin, writeContractAsync]);

  // ── Confirmation watchers ──────────────────────────────────────────────────
  useEffect(() => {
    if (approveConfirmed && step === "approving") { refetchAllowance(); setStep("swap"); }
  }, [approveConfirmed, step, refetchAllowance]);

  useEffect(() => {
    if (swapConfirmed && step === "swapping") {
      setStep("done");
      refetchBalances(); // G$ spent + USDC received — refresh wallet balances
    }
  }, [swapConfirmed, step, refetchBalances]);

  const maxGd = () => { if (gdBalance) setGdInput(formatUnits(gdBalance.value, GD_DECIMALS)); };

  const canSwap = gdNum > 0 && gdNum <= gdFormatted && quoteWei > 0n && !quoteLoading;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-green" />
            <span className="font-semibold text-base">Swap G$ → USDC</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">

          {/* Done */}
          {step === "done" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-4">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-400">Swap complete!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">≈{quoteUsdcStr} USDC added to your wallet.</p>
                  {swapHash && (
                    <a href={`https://celoscan.io/tx/${swapHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-green hover:underline mt-1 inline-block">
                      View on Celoscan →
                    </a>
                  )}
                </div>
              </div>
              {onSwapSuccess && (
                <Button className="w-full" onClick={() => { onSwapSuccess(quoteUsdcStr); onClose(); }}>
                  <ArrowDownLeft className="h-4 w-4 mr-2" />Cash out {quoteUsdcStr} USDC now
                </Button>
              )}
              <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="space-y-3">
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {errMsg || "Something went wrong."}
              </div>
              <Button variant="outline" className="w-full" onClick={() => { setStep("input"); setErrMsg(""); }}>
                <RefreshCw className="h-4 w-4 mr-2" /> Try again
              </Button>
            </div>
          )}

          {/* Input / tx steps */}
          {!["done", "error"].includes(step) && (
            <>
              {/* G$ balance */}
              <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">G$ balance</p>
                  <button onClick={maxGd} className="text-xs text-green hover:underline">Max</button>
                </div>
                <p className="text-xl font-bold text-white tabular-nums">
                  {gdLoading ? "…" : `${gdFormatted.toFixed(2)} G$`}
                </p>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Amount to swap</label>
                <Input
                  type="number" min="0" step="100" placeholder="e.g. 10000"
                  value={gdInput}
                  onChange={(e) => setGdInput(e.target.value)}
                  disabled={step !== "input"}
                  className="text-lg font-semibold"
                />
              </div>

              {/* Live quote */}
              {gdNum > 0 && (
                <div className="rounded-xl bg-green/5 border border-green/20 px-4 py-3 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">You send</span>
                    <span className="font-semibold text-white">{gdNum.toLocaleString()} G$</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">You receive ≈</span>
                    {quoteLoading ? (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Fetching quote…
                      </span>
                    ) : quoteError ? (
                      <span className="text-red-400 text-xs">Quote failed — try again</span>
                    ) : (
                      <span className="font-semibold text-green">{quoteUsdcStr} USDC</span>
                    )}
                  </div>
                  {impliedPrice && !quoteLoading && !quoteError && (
                    <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-white/5">
                      <span>Live rate</span>
                      <span>1 G$ ≈ ${impliedPrice} · 1% slippage</span>
                    </div>
                  )}
                </div>
              )}

              {/* Step indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  ["input","approve","approving"].includes(step) ? "border-green text-green" : "border-green bg-green text-black"}`}>1</span>
                <span className="flex-1 h-px bg-white/10" />
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  step === "swap" || step === "swapping" ? "border-green text-green" :
                  step === "done" ? "border-green bg-green text-black" : "border-white/20 text-white/20"}`}>2</span>
                <span className="text-white/30">Approve · Swap</span>
              </div>

              {/* Action buttons */}
              {step === "input" && needsApprove && (
                <Button className="w-full" onClick={doApprove} disabled={!canSwap}>Approve G$ Spend</Button>
              )}
              {step === "input" && !needsApprove && (
                <Button className="w-full" onClick={doSwap} disabled={!canSwap}>
                  Swap {gdNum > 0 ? `${gdNum.toLocaleString()} G$` : "G$"} → USDC
                </Button>
              )}
              {step === "approve" && (
                <Button className="w-full" onClick={doApprove} disabled={!gdNum}>Approve G$ Spend</Button>
              )}
              {step === "approving" && (
                <Button className="w-full" disabled><Loader2 className="h-4 w-4 animate-spin mr-2" />Approving…</Button>
              )}
              {step === "swap" && (
                <Button className="w-full" onClick={doSwap}><ArrowRight className="h-4 w-4 mr-2" />Confirm Swap</Button>
              )}
              {step === "swapping" && (
                <Button className="w-full" disabled><Loader2 className="h-4 w-4 animate-spin mr-2" />Swapping…</Button>
              )}

              {gdNum > gdFormatted && gdNum > 0 && (
                <p className="text-xs text-red-400 text-center">Amount exceeds your G$ balance</p>
              )}
            </>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Swap via{" "}
            <a href="https://app.uniswap.org/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Uniswap V3
            </a>
            {" "}on Celo · G$/cUSD (1%) → cUSD/USDC (0.01%)
          </p>
        </div>
      </div>
    </div>
  );
}
