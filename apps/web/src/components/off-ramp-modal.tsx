"use client";

import { useState, useEffect, useCallback } from "react";
import { useBalance, useChainId } from "wagmi";
import { Banknote, Loader2, CheckCircle2, X, AlertTriangle, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";
import { formatTokenAmountWithDecimals } from "@/lib/utils/format";
import { openFonbnkWidget } from "@/lib/fonbnk/open-widget";

/** Minimum USDC (in dollars) Fonbnk accepts for off-ramp orders. */
const FONBNK_OFFRAMP_MIN_USD = 1;

type OffRampStatus = "idle" | "loading" | "success" | "error";

interface OffRampModalProps {
  address: string;
  onClose: () => void;
}

export function OffRampModal({ address, onClose }: OffRampModalProps) {
  const chainId = useChainId();
  const [status, setStatus] = useState<OffRampStatus>("idle");
  const [errMsg, setErrMsg] = useState("");

  const usdcAddress = getTokenAddressBySymbol("USDC", chainId);
  const { data: usdcBalance, isLoading: usdcLoading } = useBalance({
    address: address as `0x${string}`,
    token: usdcAddress,
    query: { enabled: !!address && !!usdcAddress, refetchInterval: 15_000 },
  });

  const usdcFormatted = usdcBalance
    ? formatTokenAmountWithDecimals(usdcBalance.value, usdcBalance.decimals, 2)
    : "0.00";

  const usdcNumber = usdcBalance ? Number(usdcBalance.formatted) : 0;
  const belowMinimum = usdcNumber < FONBNK_OFFRAMP_MIN_USD;

  // Listen for postMessage back from the Fonbnk return popup
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!e.data || e.data.type !== "drip:fonbnk-return") return;
      if (e.data.status === "success") {
        setStatus("success");
      } else {
        setStatus("error");
        setErrMsg(e.data.failReason ?? "Order did not complete");
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const openWidget = useCallback(async () => {
    setStatus("loading");
    setErrMsg("");
    try {
      const redirectUrl =
        `${window.location.origin}/fonbnk/return` +
        `?action=offramp` +
        `&status={status}` +
        `&orderId={orderId}` +
        `&amount={usdcAmount}` +
        `&transactionHash={transactionHash}` +
        `&network={network}` +
        `&failReason={failReason}`;

      const params = new URLSearchParams({
        address,
        asset:   "USDC",
        network: "CELO",
        redirectUrl,
      });

      // In MetaMask's in-app browser popups are unsupported, so this falls back
      // to a full same-tab redirect (the return page brings the user back).
      await openFonbnkWidget({ endpoint: "/api/fonbnk/offramp-url", params, popupName: "fonbnk-offramp" });
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }, [address]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5 text-orange-400" />
            <span className="font-semibold text-base">Cash Out USDC</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* USDC balance */}
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Your USDC balance</p>
              <p className="text-xl font-bold text-white tabular-nums">
                {usdcLoading ? "…" : `${usdcFormatted} USDC`}
              </p>
            </div>
            <Banknote className="h-6 w-6 text-blue-400" />
          </div>

          {/* Below minimum warning */}
          {!usdcLoading && belowMinimum && (
            <div className="flex items-start gap-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                Your USDC balance (${usdcNumber.toFixed(2)}) is below the $1 minimum.
                Top up first, or swap G$ tokens to USDC.
              </span>
            </div>
          )}

          {/* Order limits */}
          <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-sm space-y-1.5">
            <p className="font-medium text-foreground">Off-ramp limits (per order)</p>
            <div className="flex justify-between text-muted-foreground">
              <span>Minimum</span><span className="font-medium text-foreground">$1 USDC</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Maximum</span><span className="font-medium text-foreground">$500 USDC</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Daily limit</span><span className="font-medium text-foreground">$2,000 USDC</span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground">
            Send <strong className="text-foreground">USDC</strong> from your Celo wallet and
            receive <strong className="text-foreground">MTN / Airtel Mobile Money</strong>.
            Fonbnk settles in under 30 seconds.
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            Wallet: {address.slice(0, 6)}…{address.slice(-4)}
          </p>

          {/* Success */}
          {status === "success" && (
            <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>Cash out initiated! Mobile money is on its way.</span>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
              {errMsg || "Something went wrong. Please try again."}
            </div>
          )}

          {/* CTA */}
          <Button
            className="w-full"
            size="lg"
            onClick={openWidget}
            disabled={status === "loading" || belowMinimum || usdcLoading}
          >
            {status === "loading" ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Opening Fonbnk…</>
            ) : (
              <><ArrowDownLeft className="h-4 w-4 mr-2" />Cash Out via Mobile Money</>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Powered by{" "}
            <a href="https://fonbnk.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Fonbnk
            </a>
            {" "}· MTN &amp; Airtel supported
          </p>
        </div>
      </div>
    </div>
  );
}
