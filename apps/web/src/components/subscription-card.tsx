"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit, X, Play } from "lucide-react";
import { formatEther } from "viem";
import { useSubscription } from "@/lib/contracts";

interface SubscriptionCardProps {
  subscriptionId: bigint;
  payer: string;
  recipient: string;
  amount: bigint;
  cadence: number;
  token: string;
  nextPaymentTime: bigint;
  isActive: boolean;
}

export function SubscriptionCard({
  subscriptionId,
  payer,
  recipient,
  amount,
  cadence,
  token,
  nextPaymentTime,
  isActive,
}: SubscriptionCardProps) {
  const { cancelSubscription, executePayment, isPending } = useSubscription();

  const handleCancel = () => {
    cancelSubscription(subscriptionId);
  };

  const handleExecutePayment = () => {
    executePayment(subscriptionId);
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatToken = (tokenAddress: string) => {
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      return "CELO";
    }
    return "Token";
  };

  const getCadenceLabel = (cadence: number) => {
    switch (cadence) {
      case 0:
        return "Daily";
      case 1:
        return "Weekly";
      case 2:
        return "Monthly";
      case 3:
        return "Custom";
      default:
        return "Unknown";
    }
  };

  const formatNextPayment = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString();
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Subscription #{subscriptionId.toString()}</CardTitle>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                Active
              </span>
            )}
            {!isActive && (
              <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                Cancelled
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">From:</span>
            <span className="font-mono">{formatAddress(payer)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">To:</span>
            <span className="font-mono">{formatAddress(recipient)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount:</span>
            <span>{formatEther(amount)} {formatToken(token)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Cadence:</span>
            <span>{getCadenceLabel(cadence)}</span>
          </div>
          {isActive && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next Payment:</span>
              <span>{formatNextPayment(nextPaymentTime)}</span>
            </div>
          )}
        </div>

        {isActive && (
          <div className="flex gap-2 pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExecutePayment}
              disabled={isPending}
            >
              <Play className="h-4 w-4 mr-2" />
              Execute Payment
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleCancel}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

