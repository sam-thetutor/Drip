"use client";

import { useState, useCallback, useMemo } from "react";
import {
  useAccount,
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
  AlertTriangle,
  RefreshCw,
  ArrowDownLeft,
} from "lucide-react";
import { parseUnits, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";

// ─── Uniswap V3 on Celo Mainnet ──────────────────────────────────────────────
// Official deployment: https://docs.uniswap.org/contracts/v3/reference/deployments
const SWAP_ROUTER    = "0x5615CDAb10dc425a742d643d949a7F474C01abc4" as const;
const CUSD_ADDRESS   = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;

// Swap path: G$ →(fee 3000 = 0.3%)→ cUSD →(fee 500 = 0.05%)→ USDC
// Encoding: tokenIn(20B) + fee(3B) + tokenMid(20B) + fee(3B) + tokenOut(20B)
function buildSwapPath(gdAddr: string, usdcAddr: string): `0x${string}` {
  const strip = (a: string) => a.slice(2).toLowerCase();
  return `0x${strip(gdAddr)}000bb8${strip(CUSD_ADDRESS)}0001f4${strip(usdcAddr)}` as `0x${string}`;
}

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────
const ERC20_ABI = [
  {
    name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const SWAP_ROUTER_ABI = [
  {
    name: "exactInput", type: "function", stateMutability: "payable",
    inputs: [{
      name: "params", type: "tuple",
      components: [
        { name: "path",             type: "bytes"   },
        { name: "recipient",        type: "address" },
        { name: "deadline",         type: "uint256" },
        { name: "amountIn",         type: "uint256" },
        { name: "amountOutMinimum", type: "uint256" },
      ],
    }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

// G$ price in USD (approx, updated manually — ~$0.000116 as of Jun 2026)
const GD_PRICE_USD = 0.000116;
const USDC_DECIMALS = 6;
const GD_DECIMALS   = 18;
// Slippage tolerance: 2%
const SLIPPAGE_BPS  = 200n;

type Step = "input" | "approve" | "approving" | "swap" | "swapping" | "done" | "error";

interface SwapGdModalProps {
  address: string;
  onClose: () => void;
  /** Called when the swap completes so the parent can open the off-ramp modal */
  onSwapSuccess?: (usdcAmountFormatted: string) => void;
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

  // G$ balance
  const { data: gdBalance, isLoading: gdLoading } = useBalance({
    address: address as `0x${string}`,
    token:   gdAddress,
    query: { enabled: !!address && !!gdAddress, refetchInterval: 15_000 },
  });

  // Current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: gdAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [address as `0x${string}`, SWAP_ROUTER],
    query: { enabled: !!gdAddress && !!address },
  });

  const { writeContractAsync } = useWriteContract();

  // Wait for approve tx
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
    query: { enabled: !!approveHash },
  });

  // Wait for swap tx
  const { isSuccess: swapConfirmed, data: swapReceipt } = useWaitForTransactionReceipt({
    hash: swapHash,
    query: { enabled: !!swapHash },
  });

  // Derived values
  const gdNum      = parseFloat(gdInput || "0");
  const gdFormatted = gdBalance ? parseFloat(formatUnits(gdBalance.value, GD_DECIMALS)) : 0;
  const estUsd      = gdNum * GD_PRICE_USD;
  const estUsdc     = estUsd; // 1 USDC = 1 USD
  const estUsdcStr  = estUsdc.toFixed(4);
  const belowMin    = estUsdc < 1;

  const amountInWei  = gdNum > 0 ? parseUnits(gdInput, GD_DECIMALS) : 0n;
  const estUsdcWei   = gdNum > 0 ? BigInt(Math.floor(estUsdc * 10 ** USDC_DECIMALS)) : 0n;
  // amountOutMinimum with 2% slippage
  const amountOutMin = estUsdcWei - (estUsdcWei * SLIPPAGE_BPS) / 10_000n;

  const swapPath = useMemo(
    () => gdAddress && usdcAddress ? buildSwapPath(gdAddress, usdcAddress) : ("0x" as `0x${string}`),
    [gdAddress, usdcAddress],
  );

  const needsApprove = allowance !== undefined && amountInWei > 0n && allowance < amountInWei;

  // ── Approve step ──────────────────────────────────────────────────────────
  const doApprove = useCallback(async () => {
    if (!gdAddress) return;
    setStep("approving");
    try {
      const hash = await writeContractAsync({
        address: gdAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SWAP_ROUTER, amountInWei],
      });
      setApproveHash(hash);
    } catch (e: any) {
      setStep("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? "Approval failed");
    }
  }, [gdAddress, amountInWei, writeContractAsync]);

  // ── Swap step ─────────────────────────────────────────────────────────────
  const doSwap = useCallback(async () => {
    if (!address) return;
    setStep("swapping");
    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300); // 5 min
      const hash = await writeContractAsync({
        address: SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInput",
        args: [{
          path:             swapPath,
          recipient:        address as `0x${string}`,
          deadline,
          amountIn:         amountInWei,
          amountOutMinimum: amountOutMin,
        }],
      });
      setSwapHash(hash);
    } catch (e: any) {
      setStep("error");
      setErrMsg(e?.shortMessage ?? e?.message ?? "Swap failed");
    }
  }, [address, swapPath, amountInWei, amountOutMin, writeContractAsync]);

  // ── React to tx confirmations ─────────────────────────────────────────────
  if (approveConfirmed && step === "approving") {
    refetchAllowance();
    setStep("swap");
  }
  if (swapConfirmed && step === "swapping") {
    setStep("done");
  }

  const maxGd = () => {
    if (gdBalance) setGdInput(formatUnits(gdBalance.value, GD_DECIMALS));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
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

          {/* Step: done */}
          {step === "done" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-4">
                <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-400">Swap complete!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ≈{estUsdcStr} USDC has been added to your wallet.
                  </p>
                  {swapHash && (
                    <a
                      href={`https://celoscan.io/tx/${swapHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green hover:underline mt-1 inline-block"
                    >
                      View on Celoscan →
                    </a>
                  )}
                </div>
              </div>
              {onSwapSuccess && (
                <Button className="w-full" onClick={() => { onSwapSuccess(estUsdcStr); onClose(); }}>
                  <ArrowDownLeft className="h-4 w-4 mr-2" />
                  Cash out {estUsdcStr} USDC now
                </Button>
              )}
              <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
            </div>
          )}

          {/* Step: error */}
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

          {/* Steps: input / approve / approving / swap / swapping */}
          {!["done", "error"].includes(step) && (
            <>
              {/* G$ balance display */}
              <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">G$ balance</p>
                  <button onClick={maxGd} className="text-xs text-green hover:underline">Max</button>
                </div>
                <p className="text-xl font-bold text-white tabular-nums">
                  {gdLoading ? "…" : `${gdFormatted.toFixed(2)} G$`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  ≈ ${(gdFormatted * GD_PRICE_USD).toFixed(4)} USD
                </p>
              </div>

              {/* Amount input */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Amount of G$ to swap</label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="e.g. 10000"
                  value={gdInput}
                  onChange={(e) => setGdInput(e.target.value)}
                  disabled={step !== "input"}
                  className="text-lg font-semibold"
                />
              </div>

              {/* Estimate */}
              {gdNum > 0 && (
                <div className="rounded-xl bg-green/5 border border-green/20 px-4 py-3 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">You send</span>
                    <span className="font-semibold text-white">{gdNum.toLocaleString()} G$</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">You receive ≈</span>
                    <span className="font-semibold text-green">{estUsdcStr} USDC</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-white/5">
                    <span>Rate</span>
                    <span>1 G$ ≈ ${GD_PRICE_USD} · 2% slippage</span>
                  </div>
                </div>
              )}

              {/* Below minimum warning */}
              {gdNum > 0 && belowMin && (
                <div className="flex items-start gap-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-xs text-yellow-400">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    ${estUsd.toFixed(4)} is below Fonbnk&apos;s $1 minimum. You need at least ~8,600 G$ to off-ramp.
                  </span>
                </div>
              )}

              {/* Progress indicator */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  ["input","approve","approving"].includes(step) ? "border-green text-green" : "border-green bg-green text-black"}`}>
                  1
                </span>
                <span className="flex-1 h-px bg-white/10" />
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  step === "swap" || step === "swapping" ? "border-green text-green" :
                  step === "done" ? "border-green bg-green text-black" : "border-white/20 text-white/20"}`}>
                  2
                </span>
                <span className="text-white/30">Approve · Swap</span>
              </div>

              {/* Action button */}
              {(step === "input" && needsApprove) && (
                <Button className="w-full" onClick={doApprove} disabled={!gdNum || belowMin || gdNum > gdFormatted}>
                  Approve G$ Spend
                </Button>
              )}
              {(step === "input" && !needsApprove) && (
                <Button className="w-full" onClick={doSwap} disabled={!gdNum || belowMin || gdNum > gdFormatted}>
                  Swap {gdNum > 0 ? `${gdNum.toLocaleString()} G$` : "G$"} → USDC
                </Button>
              )}
              {step === "approve" && (
                <Button className="w-full" onClick={doApprove} disabled={!gdNum}>
                  Approve G$ Spend
                </Button>
              )}
              {step === "approving" && (
                <Button className="w-full" disabled>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Approving…
                </Button>
              )}
              {step === "swap" && (
                <Button className="w-full" onClick={doSwap}>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Confirm Swap
                </Button>
              )}
              {step === "swapping" && (
                <Button className="w-full" disabled>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Swapping…
                </Button>
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
            {" "}on Celo · G$/cUSD pool
          </p>
        </div>
      </div>
    </div>
  );
}
