"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Loader2, ArrowRight } from "lucide-react";
import { formatEther } from "viem";
import { useAutoRefreshStreamData, useSuperfluidClaim } from "@/lib/contracts";
import { useAccount } from "wagmi";
import { toast } from "sonner";
import { useEffect, useMemo } from "react";
import Link from "next/link";

interface SuperfluidStreamCardProps {
  streamId: bigint;
}

export function SuperfluidStreamCard({ streamId }: SuperfluidStreamCardProps) {
  const { address } = useAccount();
  const { streamData, isLoading } = useAutoRefreshStreamData(streamId, address);
  const { claim, isPending, isConfirming, isConfirmed, error } = useSuperfluidClaim();

  const statusText = ["Pending", "Active", "Paused", "Cancelled", "Completed"];
  const statusColors = {
    0: "bg-yellow-100 text-yellow-800",
    1: "bg-green-100 text-green-800",
    2: "bg-orange-100 text-orange-800",
    3: "bg-red-100 text-red-800",
    4: "bg-gray-100 text-gray-800",
  };

  const calculations = useMemo(() => {
    if (!streamData?.recipientInfo) return null;

    const flowRatePerHour = streamData.recipientInfo.ratePerSecond * 3600n;
    const flowRatePerDay = streamData.recipientInfo.ratePerSecond * 86400n;

    const now = BigInt(Math.floor(Date.now() / 1000));
    const timeRemainingSeconds = streamData.endTime > now ? Number(streamData.endTime - now) : 0;
    const projectedTotal = 
      streamData.recipientInfo.totalWithdrawn + 
      streamData.claimableNow + 
      (streamData.recipientInfo.ratePerSecond * BigInt(timeRemainingSeconds));

    const progress = streamData.endTime > streamData.startTime
      ? ((Number(now - streamData.startTime) / Number(streamData.endTime - streamData.startTime)) * 100)
      : 0;

    return {
      flowRatePerHour,
      flowRatePerDay,
      timeRemainingSeconds,
      projectedTotal,
      progress: Math.min(progress, 100),
    };
  }, [streamData]);

  useEffect(() => {
    if (isConfirmed) {
      toast.success("Successfully claimed tokens!");
    }
    if (error) {
      toast.error(`Failed to claim: ${error.message}`);
    }
  }, [isConfirmed, error]);

  const handleClaim = () => {
    if (!streamData) return;
    claim(streamData.streamId);
    toast.info("Claiming tokens...");
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!streamData) {
    return (
      <Card className="glass-card">
        <CardContent className="py-6">
          <p className="text-center text-muted-foreground">Stream not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl mb-2">{streamData.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Stream #{streamData.streamId}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              statusColors[streamData.status as keyof typeof statusColors]
            }`}
          >
            {statusText[streamData.status]}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Flow Rate Metrics */}
        {calculations && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Flow Rate
              </p>
              <p className="text-lg font-semibold">
                {parseFloat(formatEther(calculations.flowRatePerHour)).toFixed(4)} G$/hr
              </p>
              <p className="text-xs text-muted-foreground">
                {parseFloat(formatEther(calculations.flowRatePerDay)).toFixed(2)} G$/day
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Claimable Now
              </p>
              <p className="text-lg font-semibold text-green-600">
                {parseFloat(formatEther(streamData.claimableNow)).toFixed(4)} G$
              </p>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Total Withdrawn
              </p>
              <p className="text-lg font-semibold">
                {streamData.recipientInfo 
                  ? parseFloat(formatEther(streamData.recipientInfo.totalWithdrawn)).toFixed(2)
                  : '0'} G$
              </p>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {calculations && (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>Started: {new Date(Number(streamData.startTime) * 1000).toLocaleDateString()}</span>
              <span>Ends: {new Date(Number(streamData.endTime) * 1000).toLocaleDateString()}</span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-600 transition-all duration-300"
                style={{ width: `${calculations.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Projection */}
        {calculations && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 text-center">
            <p className="text-xs text-emerald-700 uppercase tracking-wide mb-1">
              Projected Total
            </p>
            <p className="text-2xl font-bold text-emerald-800">
              {parseFloat(formatEther(calculations.projectedTotal)).toFixed(2)} G$
            </p>
            <p className="text-xs text-emerald-600 mt-1">
              {Math.floor(calculations.timeRemainingSeconds / 3600)} hours remaining
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {streamData.claimableNow > 0n && (
            <Button
              className="flex-1"
              onClick={handleClaim}
              disabled={isPending || isConfirming}
            >
              {isPending || isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Claim {parseFloat(formatEther(streamData.claimableNow)).toFixed(4)} G$
                </>
              )}
            </Button>
          )}
          
          <Button asChild variant="outline">
            <Link href={`/streams/${streamData.streamId}`}>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => window.open(`https://console.superfluid.finance/celo/accounts/${address}`, '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>

        {/* Pool Info */}
        <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t">
          <div className="flex justify-between">
            <span>Sender:</span>
            <span className="font-mono">{streamData.sender.slice(0, 6)}...{streamData.sender.slice(-4)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Deposit:</span>
            <span>{parseFloat(formatEther(streamData.deposit)).toFixed(2)} G$</span>
          </div>
          <div className="flex justify-between">
            <span>Recipients:</span>
            <span>{streamData.recipients.length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
