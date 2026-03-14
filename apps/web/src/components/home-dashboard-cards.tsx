"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UbiClaimCard } from "@/components/gooddollar/ubi-claim-card";
import { FaceVerification } from "@/components/gooddollar/face-verification";
import { useIdentitySDK } from "@/lib/gooddollar/hooks/useIdentitySDK";

type HomeDashboardCardsProps = {
  activeStreamsCount: number;
  recipientSamples: string[];
  isStreamsLoading: boolean;
};

export function HomeDashboardCards({
  activeStreamsCount,
  recipientSamples,
  isStreamsLoading,
}: HomeDashboardCardsProps) {
  const { identityStatus } = useIdentitySDK();
  const isVerified = identityStatus.isWhitelisted;
  const hasRecipients = recipientSamples.length > 0;
  const streamsLabel = isStreamsLoading
    ? "Loading..."
    : `${activeStreamsCount} stream${activeStreamsCount === 1 ? "" : "s"}`;

  return (
    <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-3">
      <Card className="glass-card fade-in stagger-1">
        <CardHeader>
          <CardTitle className="text-base">Active streams</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground/75">
          <div className="flex items-center justify-between">
            <span>Total flowing</span>
            <span className="font-semibold text-white">{streamsLabel}</span>
          </div>
          <div className="space-y-3">
            {isStreamsLoading ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-foreground/60">
                Loading streams...
              </div>
            ) : hasRecipients ? (
              recipientSamples.map((recipient) => (
                <div
                  key={recipient}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <span>{recipient}</span>
                  <span className="text-green">Streaming</span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-foreground/60">
                No active streams yet
              </div>
            )}
          </div>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/streams/create">Manage streams</Link>
          </Button>
        </CardContent>
      </Card>

      {isVerified ? <UbiClaimCard /> : <FaceVerification />}

      <Card className="glass-card fade-in stagger-3">
        <CardHeader>
          <CardTitle className="text-base">Milestones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-foreground/75">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            Stream 30 days - unlock badge
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            Invite 5 friends - +5 $G
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            Stake $100 - unlock boosts
          </div>
          <Button variant="outline" className="w-full">
            View progress
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
