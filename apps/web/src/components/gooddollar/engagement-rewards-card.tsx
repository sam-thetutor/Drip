"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEngagementRewards } from "@/lib/gooddollar/hooks/useEngagementRewards";
import { useAccount, useChainId } from "wagmi";
import {
  Gift,
  Loader2,
  CheckCircle2,
  XCircle,
  Share2,
  Copy,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { isSupportedChain } from "@/lib/gooddollar/utils";
import { useState } from "react";

export function EngagementRewardsCard() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const {
    isReady,
    isInitializing,
    isUserRegistered,
    canClaim,
    error,
    checkUserRegistration,
    checkCanClaim,
  } = useEngagementRewards();
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  if (!isConnected || !address) {
    return null;
  }

  if (!isSupportedChain(chainId)) {
    return null;
  }

  const generateInviteLink = () => {
    if (!address) return;

    setIsGeneratingLink(true);
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const inviteLink = `${baseUrl}/streams/create?inviter=${address}`;
      
      // Copy to clipboard
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(inviteLink);
        toast.success("Invite link copied to clipboard!", {
          description: "Share this link to earn rewards when friends create streams.",
          duration: 5000,
        });
      } else {
        // Fallback: show the link
        toast.info("Invite Link", {
          description: inviteLink,
          duration: 10000,
        });
      }
    } catch (err) {
      console.error("Error generating invite link:", err);
      toast.error("Failed to generate invite link");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const isLoading = isInitializing || !isReady;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gift className="h-5 w-5" />
          Engagement Rewards
        </CardTitle>
        <CardDescription>
          Earn rewards for creating streams and inviting friends
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading engagement rewards...
            </span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <span className="text-sm">{error.message}</span>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Registration Status:</span>
                <div className="flex items-center gap-2">
                  {isUserRegistered ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Registered</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm font-medium">Not Registered</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Eligibility:</span>
                <div className="flex items-center gap-2">
                  {canClaim ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Eligible</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Not Eligible</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <Button
                onClick={generateInviteLink}
                disabled={isGeneratingLink}
                variant="outline"
                className="w-full"
              >
                {isGeneratingLink ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4 mr-2" />
                    Generate Invite Link
                  </>
                )}
              </Button>
            </div>

            {!isUserRegistered && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-900 dark:text-blue-100">
                  <strong>Note:</strong> You'll be automatically registered when you create your first stream or withdraw from a stream.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

