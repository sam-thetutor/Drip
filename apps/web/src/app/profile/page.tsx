"use client";

import { useAccount, useChainId } from "wagmi";
import {
  User,
  Shield,
  Copy,
  Check,
  Settings,
  Bell,
  Palette,
  HelpCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IdentityStatus } from "@/components/gooddollar/identity-status";
import { FaceVerification } from "@/components/gooddollar/face-verification";
import { InviteLinkGenerator } from "@/components/gooddollar/invite-link-generator";
import { isSupportedChain } from "@/lib/gooddollar/utils";
import { toast } from "sonner";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!isConnected || !address) {
    return (
      <main className="flex-1">
        <div className="container mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <User className="h-12 w-12 text-foreground/40" />
            <h2 className="text-xl font-semibold text-white">
              Connect your wallet
            </h2>
            <p className="text-sm text-foreground/60">
              Connect your wallet to view your profile.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const isGoodDollarChain = isSupportedChain(chainId);

  return (
    <main className="flex-1">
      <div className="container mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-foreground/60">
            Profile
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Your Drip identity
          </h1>
          <p className="text-sm text-foreground/70">
            Manage your identity, view stats, and invite friends.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - 2/3 width */}
          <div className="space-y-6 lg:col-span-2">
            {/* Wallet Address Card */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5 text-green" />
                  Wallet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-white truncate">
                      {address}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyAddress}
                    className="h-8 w-8 shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Identity Verification */}
            {isGoodDollarChain && (
              <>
                <IdentityStatus />
                <FaceVerification />
              </>
            )}
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-6">
            {/* Invite Link Generator */}
            {isGoodDollarChain && <InviteLinkGenerator />}

            {/* Settings (Placeholder) */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-5 w-5" />
                  Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <Bell className="h-4 w-4" />
                  <span>Notifications</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Soon
                  </span>
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <Palette className="h-4 w-4" />
                  <span>Theme</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Dark
                  </span>
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <Shield className="h-4 w-4" />
                  <span>Privacy</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Soon
                  </span>
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <HelpCircle className="h-4 w-4" />
                  <span>Help & FAQ</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Soon
                  </span>
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
