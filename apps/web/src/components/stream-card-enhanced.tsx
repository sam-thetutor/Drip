"use client";

import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pause, Play, X, Download, ExternalLink } from "lucide-react";
import { formatEther, formatUnits } from "viem";
import { formatTokenAmount } from "@/lib/utils/format";
import { useDrip, useRecipientBalance } from "@/lib/contracts";
import { getTokenByAddress } from "@/components/token-selector";
import { useChainId } from "wagmi";
import { toast } from "sonner";
import { useEffect } from "react";
import Link from "next/link";

interface StreamCardEnhancedProps {
  streamId: bigint;
  sender: string;
  recipients: string[];
  token: string;
  startTime: bigint;
  endTime: bigint;
  status: number; // 0 = Active, 1 = Paused, 2 = Completed, 3 = Cancelled
  title?: string;
  userRole?: "sender" | "recipient" | "both";
}

export function StreamCardEnhanced({
  streamId,
  sender,
  recipients,
  token,
  startTime,
  endTime,
  status,
  title,
  userRole,
}: StreamCardEnhancedProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { pauseStream, resumeStream, cancelStream, withdrawFromStream, isPending } = useDrip();

  const isPaused = status === 1;
  const isActive = status === 0;
  const isCompleted = status === 2;
  const isCancelled = status === 3;

  const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId);
  const decimals = tokenInfo?.decimals || 18;
  const symbol = tokenInfo?.symbol || "Token";

  // Fetch balance for user if they are a recipient
  const isUserRecipient = address && recipients.some(r => r.toLowerCase() === address.toLowerCase());
  const { balance: userBalance, refetch: refetchBalance } = useRecipientBalance(
    isUserRecipient && isActive ? streamId : undefined,
    isUserRecipient ? address : undefined
  );

  // Poll for balance updates every 5 seconds
  useEffect(() => {
    if (!isUserRecipient || !isActive) return;

    const interval = setInterval(() => {
      refetchBalance();
    }, 5000);

    return () => clearInterval(interval);
  }, [isUserRecipient, isActive, refetchBalance]);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatTime = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString();
  };

  const getTimeRemaining = () => {
    if (!isActive && !isPaused) return null;
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (endTime > now) {
      const remaining = Number(endTime - now);
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      return `${days}d ${hours}h`;
    }
    return "Ended";
  };

  const handlePause = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      toast.loading("Pausing stream...", { id: "pause-stream" });
      await pauseStream(streamId);
      toast.success("Stream paused", { id: "pause-stream" });
    } catch (error: any) {
      toast.error(error?.message || "Failed to pause stream", { id: "pause-stream" });
    }
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      toast.loading("Resuming stream...", { id: "resume-stream" });
      await resumeStream(streamId);
      toast.success("Stream resumed", { id: "resume-stream" });
    } catch (error: any) {
      toast.error(error?.message || "Failed to resume stream", { id: "resume-stream" });
    }
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to cancel this stream?")) return;
    
    try {
      toast.loading("Cancelling stream...", { id: "cancel-stream" });
      await cancelStream(streamId);
      toast.success("Stream cancelled", { id: "cancel-stream" });
    } catch (error: any) {
      toast.error(error?.message || "Failed to cancel stream", { id: "cancel-stream" });
    }
  };

  const handleWithdraw = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!address) return;
    
    try {
      toast.loading("Withdrawing...", { id: "withdraw-stream" });
      // Withdraw maximum available (0 means withdraw all)
      await withdrawFromStream(streamId, address);
      toast.success("Withdrawal successful", { id: "withdraw-stream" });
      // Refetch balance after withdrawal
      setTimeout(() => refetchBalance(), 2000);
    } catch (error: any) {
      toast.error(error?.message || "Failed to withdraw", { id: "withdraw-stream" });
    }
  };

  const isUserSender = address && sender.toLowerCase() === address.toLowerCase();

  return (
    <Card className="hover:shadow-lg transition-shadow cursor-pointer">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">
              {title || `Stream #${streamId.toString()}`}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              ID: {streamId.toString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && !isPaused && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                Active
              </span>
            )}
            {isPaused && (
              <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                Paused
              </span>
            )}
            {isCompleted && (
              <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                Completed
              </span>
            )}
            {isCancelled && (
              <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                Cancelled
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">From:</span>
            <span className="font-mono">{formatAddress(sender)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Recipients:</span>
            <span>{recipients.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Token:</span>
            <span>{symbol}</span>
          </div>
          {(isActive || isPaused) && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time Remaining:</span>
              <span>{getTimeRemaining()}</span>
            </div>
          )}
          {isUserRecipient && userBalance !== undefined && (
            <div className="flex justify-between pt-2 border-t">
              <span className="text-muted-foreground">Your Balance:</span>
              <span className="font-semibold text-green-600">
                {formatTokenAmount(userBalance, decimals)} {symbol}
              </span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2 border-t">
          {isUserSender && (isActive || isPaused) && (
            <>
              {!isPaused ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePause}
                  disabled={isPending}
                  className="flex-1"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResume}
                  disabled={isPending}
                  className="flex-1"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </>
          )}
          {isUserRecipient && userBalance !== undefined && userBalance > 0n && (
            <Button
              variant="default"
              size="sm"
              onClick={handleWithdraw}
              disabled={isPending}
              className="flex-1"
            >
              <Download className="h-4 w-4 mr-2" />
              Withdraw
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

