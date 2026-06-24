"use client";

import { useState, useEffect, useCallback } from "react";
import { Smartphone, Loader2, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openFonbnkWidget } from "@/lib/fonbnk/open-widget";

type TopUpStatus = "idle" | "loading" | "success" | "error";

export function TopUpModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [status, setStatus] = useState<TopUpStatus>("idle");
  const [errMsg, setErrMsg] = useState("");

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
        `?action=topup` +
        `&status={status}` +
        `&orderId={orderId}` +
        `&amount={usdcAmount}` +
        `&transactionHash={transactionHash}` +
        `&network={network}` +
        `&failReason={failReason}`;

      const params = new URLSearchParams({
        address,
        asset:       "USDC",
        network:     "CELO",
        redirectUrl,
      });

      // In MetaMask's in-app browser popups are unsupported, so this falls back
      // to a full same-tab redirect (the return page brings the user back).
      await openFonbnkWidget({ endpoint: "/api/fonbnk/widget-url", params, popupName: "fonbnk" });
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrMsg(err instanceof Error ? err.message : "Unknown error");
    }
  }, [address]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-500" />
            <span className="font-semibold text-base">Add money via Mobile Money</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Limits */}
          <div className="rounded-xl bg-muted/50 border border-border px-4 py-3 text-sm space-y-1">
            <p className="font-medium text-foreground">Order limits (per transaction)</p>
            <div className="flex justify-between text-muted-foreground">
              <span>Minimum</span><span className="font-medium text-foreground">$1 USD</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Maximum</span><span className="font-medium text-foreground">$500 USD</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Daily limit</span><span className="font-medium text-foreground">$2,000 USD</span>
            </div>
          </div>

          {/* Description */}
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              Pay with <strong className="text-foreground">MTN / Airtel Mobile Money</strong> — Fonbnk
              delivers <strong className="text-foreground">USDC</strong> directly to your Celo wallet.
            </p>
            <p className="text-xs">
              Your wallet:{" "}
              <span className="font-mono text-foreground">{address.slice(0, 6)}…{address.slice(-4)}</span>
            </p>
          </div>

          {/* Success */}
          {status === "success" && (
            <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Payment complete! USDC is on its way to your wallet.</span>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
              {errMsg || "Something went wrong. Please try again."}
            </div>
          )}

          {/* CTA */}
          <Button className="w-full" size="lg" onClick={openWidget} disabled={status === "loading"}>
            {status === "loading" ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Opening Fonbnk…</>
            ) : (
              <><Smartphone className="h-4 w-4 mr-2" />Buy USDC with Mobile Money</>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Powered by{" "}
            <a href="https://fonbnk.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              Fonbnk
            </a>{" "}
            · MTN &amp; Airtel supported
          </p>
        </div>
      </div>
    </div>
  );
}
