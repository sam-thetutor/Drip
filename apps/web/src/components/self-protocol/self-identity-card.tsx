"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { Shield, CheckCircle2, Loader2, QrCode, ExternalLink } from "lucide-react";
import { useState } from "react";

export function SelfIdentityCard() {
  const { address, isConnected } = useAccount();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

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

  const handleVerify = () => {
    // TODO: Implement Self Protocol verification
    setIsVerifying(true);
    // Simulate verification process
    setTimeout(() => {
      setIsVerifying(false);
      setIsVerified(true);
    }, 2000);
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Self Protocol
        </CardTitle>
        <CardDescription>Privacy-first identity verification using zero-knowledge proofs</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isVerified ? (
          <div className="p-4 rounded-lg bg-green/10 border border-green/20">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green mb-1">Verified</p>
                <p className="text-xs text-muted-foreground">
                  Your identity has been verified using Self Protocol
                </p>
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

            <Button
              onClick={handleVerify}
              disabled={isVerifying}
              className="w-full"
              size="lg"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <QrCode className="h-4 w-4 mr-2" />
                  Verify with Self Protocol
                </>
              )}
            </Button>
          </>
        )}

        <div className="pt-2 border-t border-white/10">
          <a
            href="https://docs.self.xyz"
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

