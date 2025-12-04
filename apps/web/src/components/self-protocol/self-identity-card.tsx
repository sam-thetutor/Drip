"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { Shield, CheckCircle2, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { useSelfProtocol } from "@/lib/self-protocol/hooks/useSelfProtocol";
import { QRCodeVerification } from "./qr-code-verification";
import { SELF_DOCS } from "@/lib/self-protocol/constants";

export function SelfIdentityCard() {
  const { address, isConnected } = useAccount();
  const {
    verificationStatus,
    qrCodeState,
    checkVerificationStatus,
    isReady,
  } = useSelfProtocol();

  if (!isConnected || !address) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Self Protocol</CardTitle>
          <CardDescription>Connect your wallet to verify your identity</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isLoading = verificationStatus.isLoading || !isReady;
  const isVerified = verificationStatus.isVerified;

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Self Protocol
            </CardTitle>
            <CardDescription>Privacy-first identity verification using zero-knowledge proofs</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={checkVerificationStatus}
            disabled={isLoading}
            className="h-8 w-8"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && !verificationStatus.error ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-green" />
            <span className="ml-2 text-muted-foreground">Loading verification status...</span>
          </div>
        ) : verificationStatus.error ? (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Error</p>
              <p className="text-xs text-muted-foreground mt-1">
                {verificationStatus.error.message}
              </p>
            </div>
          </div>
        ) : isVerified ? (
          <div className="p-4 rounded-lg bg-green/10 border border-green/20">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green mb-1">Verified</p>
                <p className="text-xs text-muted-foreground">
                  Your identity has been verified using Self Protocol
                  {verificationStatus.verifiedAt && (
                    <> on {verificationStatus.verifiedAt.toLocaleDateString()}</>
                  )}
                </p>
                {verificationStatus.proofId && (
                  <p className="text-xs text-muted-foreground mt-1 font-mono">
                    Proof ID: {verificationStatus.proofId.substring(0, 16)}...
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 rounded-lg bg-muted/30 border border-white/10">
              <p className="text-sm text-muted-foreground mb-2">
                Self Protocol uses zero-knowledge proofs to verify your identity while preserving your privacy.
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Privacy-first verification</li>
                <li>No personal data exposure</li>
                <li>Sybil resistance</li>
              </ul>
            </div>

            {/* QR Code Verification Component */}
            <QRCodeVerification />
          </>
        )}

        <div className="pt-2 border-t border-white/10">
          <a
            href={SELF_DOCS.MAIN}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-green transition-colors flex items-center gap-1"
          >
            Learn more about Self Protocol
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

