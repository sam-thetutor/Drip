"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

/**
 * Popup landing page Fonbnk redirects to after an order completes or fails.
 *
 * Flow:
 * 1. The main tab opened this page with window.open(). Fonbnk redirects here
 *    with ?status=success|failed&orderId=…&amount=…&transactionHash=…
 * 2. We postMessage({ type: "drip:fonbnk-return", … }) to the opener so it
 *    can refresh balances and show a toast.
 * 3. We close ourselves. If the browser blocks close(), we show a fallback.
 */

function ReturnContent() {
  const params     = useSearchParams();
  const status     = params.get("status")           ?? "unknown";
  const action     = params.get("action")           ?? "topup"; // "topup" | "offramp"
  const orderId    = params.get("orderId")           ?? null;
  const amount     = params.get("amount")            ?? null;
  const txHash     = params.get("transactionHash")   ?? null;
  const network    = params.get("network")           ?? null;
  const failReason = params.get("failReason")        ?? null;

  const [cannotClose, setCannotClose] = useState(false);
  // No opener means we got here via a full same-tab redirect (in-app browsers
  // like MetaMask's WebView, where popups are unsupported). In that case there's
  // nothing to postMessage/close — show a "Back to Drip" link instead.
  const [sameTab, setSameTab] = useState(false);

  useEffect(() => {
    const hasOpener = typeof window !== "undefined" && !!window.opener && window.opener !== window;

    if (!hasOpener) {
      setSameTab(true);
      return;
    }

    try {
      window.opener.postMessage(
        { type: "drip:fonbnk-return", action, status, orderId, amount, txHash, network, failReason },
        window.location.origin,
      );
    } catch {
      // opener may be inaccessible — fall through to manual close
    }

    const t = setTimeout(() => {
      try { window.close(); } finally { setCannotClose(true); }
    }, 700);

    return () => clearTimeout(t);
  }, [action, status, orderId, amount, txHash, network, failReason]);

  const ok = status === "success";
  const isOfframp = action === "offramp";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-sm w-full text-center space-y-4">
        {ok ? (
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
        ) : (
          <XCircle className="h-14 w-14 text-red-400 mx-auto" />
        )}
        <h1 className="text-xl font-semibold">
          {ok
            ? (isOfframp ? "Cash out complete!" : "Top up complete!")
            : (isOfframp ? "Cash out didn't complete" : "Top up didn't complete")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {ok
            ? (isOfframp
                ? `Mobile money is on its way.${sameTab ? "" : " You can close this window."}`
                : `Funds will land in your wallet shortly.${sameTab ? "" : " You can close this window."}`)
            : failReason
              ? `Reason: ${failReason}.${sameTab ? " You can try again." : " Close this window and try again."}`
              : sameTab ? "Please try again." : "Close this window and try again."}
        </p>
        {sameTab && (
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-green-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-600"
          >
            Back to Drip
          </a>
        )}
        {cannotClose && !sameTab && (
          <p className="text-xs text-muted-foreground">
            You can close this tab manually.
          </p>
        )}
      </div>
    </div>
  );
}

export default function FonbnkReturnPage() {
  return (
    <Suspense>
      <ReturnContent />
    </Suspense>
  );
}
