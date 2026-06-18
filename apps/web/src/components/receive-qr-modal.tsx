"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Copy, CheckCircle2, Share2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReceiveQrModalProps {
  address: string;
  onClose: () => void;
}

export function ReceiveQrModal({ address, onClose }: ReceiveQrModalProps) {
  const [copied, setCopied]   = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  // Build create-stream pre-fill URL on the client (needs window.location)
  useEffect(() => {
    setShareUrl(
      `${window.location.origin}/streams/create?recipient=${address}`
    );
  }, [address]);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const share = () => {
    const text = `Send me money on Drip: ${shareUrl}`;
    if (navigator.share) {
      navigator.share({ title: "Get paid on Drip", url: shareUrl, text });
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadQr = () => {
    const svg = document.getElementById("drip-receive-qr");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drip-${address.slice(0, 8)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <span className="font-semibold text-base">Receive Payments</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* QR code */}
          <div className="flex justify-center">
            <div className="rounded-2xl bg-white p-4 shadow-inner">
              <QRCodeSVG
                id="drip-receive-qr"
                value={shareUrl || address}
                size={200}
                level="M"
                includeMargin={false}
                fgColor="#000000"
                bgColor="#ffffff"
              />
            </div>
          </div>

          {/* Address display */}
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">Your wallet address</p>
            <p className="font-mono text-sm text-white break-all leading-relaxed">{address}</p>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Share this QR code or link — anyone can scan it to send you money on Drip.
          </p>

          {/* Actions */}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" className="flex flex-col gap-1 h-auto py-3" onClick={copyAddress}>
              {copied
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Copy className="h-5 w-5" />}
              <span className="text-xs">{copied ? "Copied!" : "Copy"}</span>
            </Button>
            <Button variant="outline" className="flex flex-col gap-1 h-auto py-3" onClick={share}>
              <Share2 className="h-5 w-5" />
              <span className="text-xs">Share</span>
            </Button>
            <Button variant="outline" className="flex flex-col gap-1 h-auto py-3" onClick={downloadQr}>
              <Download className="h-5 w-5" />
              <span className="text-xs">Save QR</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
