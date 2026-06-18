"use client";

import { useAccount } from "wagmi";
import { useRecipientBalance } from "@/lib/contracts";
import { useDrip } from "@/lib/contracts";
import { useEngagementRewards } from "@/lib/gooddollar/hooks/useEngagementRewards";
import { formatTokenAmount } from "@/lib/utils/format";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTokenByAddress } from "@/components/token-selector";
import { useChainId } from "wagmi";
import { Loader2 } from "lucide-react";

interface WithdrawModalProps {
  streamId: bigint;
  recipient: `0x${string}`;
  token: `0x${string}`;
  onClose: () => void;
}

export function WithdrawModal({ streamId, recipient, token, onClose }: WithdrawModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { balance, isLoading: balanceLoading, refetch: refetchBalance } = useRecipientBalance(streamId, recipient);
  const { withdrawFromStream, isPending, isConfirming, isConfirmed, hash, error } = useDrip();
  const { 
    engagementRewards, 
    isReady: isEngagementRewardsReady, 
    isUserRegistered, 
    signClaim, 
    getCurrentBlockNumber 
  } = useEngagementRewards();
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  // Get inviter from localStorage (if previously set)
  const [inviter] = useState<`0x${string}` | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("drip_inviter");
      if (stored && /^0x[a-fA-F0-9]{40}$/.test(stored)) {
        return stored as `0x${string}`;
      }
    }
    return null;
  });

  // Get token info for formatting
  const tokenInfo = getTokenByAddress(token, chainId) || { decimals: 18, symbol: "CELO" };

  const maxAmount = (typeof balance === 'bigint' ? balance : 0n);
  const formattedMax = formatTokenAmount(maxAmount, tokenInfo.decimals);

  // Watch for transaction hash (wallet should open when hash is set)
  useEffect(() => {
    if (hash && hasSubmitted) {
      toast.loading("Waiting for confirmation...", { id: "withdraw" });
    }
  }, [hash, hasSubmitted]);

  // Watch for transaction confirmation
  useEffect(() => {
    if (hasSubmitted && isConfirmed) {
      toast.success("Withdrawal successful!", { id: "withdraw" });
      setHasSubmitted(false);
      // Refetch balance after withdrawal to show updated balance
      // Add a small delay to ensure the transaction is fully processed on-chain
      setTimeout(() => {
        refetchBalance();
        // Close modal after refetching balance (user can see updated balance if they reopen)
        // Or keep it open for a moment to show the updated balance
        setTimeout(() => {
          onClose();
        }, 1000);
      }, 2000);
    }
  }, [isConfirmed, hasSubmitted, onClose, refetchBalance]);

  // Handle errors from the hook
  useEffect(() => {
    if (error && hasSubmitted) {
      console.error("Transaction error:", error);
      const errorMessage = (error as Error)?.message || (error as any)?.shortMessage || "Failed to withdraw. Please check that your wallet is open and try again.";
      toast.error(errorMessage, { id: "withdraw", duration: 5000 });
      setHasSubmitted(false);
    }
  }, [error, hasSubmitted]);

  const handleWithdraw = async () => {
    if (!address || address.toLowerCase() !== recipient.toLowerCase()) {
      toast.error("You can only withdraw your own balance");
      return;
    }

    if (maxAmount === 0n) {
      toast.error("No balance available to withdraw");
      return;
    }

    try {
      toast.loading("Opening wallet...", { id: "withdraw" });
      setHasSubmitted(true);
      
      // Prepare engagement rewards parameters if enabled
      let engagementRewardsParams: {
        inviter: `0x${string}` | null;
        validUntilBlock: bigint | undefined;
        signature: `0x${string}` | undefined;
      } = {
        inviter: null,
        validUntilBlock: undefined,
        signature: undefined,
      };

      // Only include engagement rewards if SDK is ready and user is registered or needs to register
      if (isEngagementRewardsReady && engagementRewards && address) {
        try {
          // Get current block number
          const currentBlock = await getCurrentBlockNumber();
          if (currentBlock) {
            const validUntilBlock = currentBlock + 600n; // Valid for 600 blocks (~2 hours)
            
            // Check if user needs to sign (first-time registration)
            const needsSignature = isUserRegistered === false;
            
            let signature: `0x${string}` = "0x";
            if (needsSignature) {
              toast.loading("Signing for engagement rewards...", { id: "engagement-signature" });
              try {
                signature = await signClaim(inviter, validUntilBlock);
                toast.success("Signature generated", { id: "engagement-signature", duration: 2000 });
              } catch (err) {
                console.error("Failed to generate signature:", err);
                toast.error("Failed to generate signature. Withdrawal will proceed without engagement rewards.", {
                  id: "engagement-signature",
                  duration: 5000,
                });
                // Continue without signature - contract will handle it
                signature = "0x";
              }
            }

            engagementRewardsParams = {
              inviter,
              validUntilBlock,
              signature: signature !== "0x" ? signature : undefined,
            };
          }
        } catch (err) {
          console.error("Error preparing engagement rewards:", err);
          // Continue without engagement rewards if there's an error
        }
      }
      
      // Always withdraw all available balance
      // writeContract should trigger the wallet confirmation
      // If the wallet doesn't open, writeContract will throw an error
      await withdrawFromStream(
        streamId,
        recipient,
        engagementRewardsParams.inviter,
        engagementRewardsParams.validUntilBlock,
        engagementRewardsParams.signature
      );
    } catch (error: any) {
      console.error("Error in handleWithdraw:", error);
      // Extract error message from various possible error formats
      const errorMessage = 
        error?.message || 
        error?.reason || 
        error?.shortMessage || 
        (error?.cause && typeof error.cause === 'object' && error.cause?.message) ||
        "Failed to withdraw. Please check that your wallet is open and connected.";
      toast.error(errorMessage, { id: "withdraw", duration: 5000 });
      setHasSubmitted(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw from Stream</DialogTitle>
          <DialogDescription>
            Withdraw available balance from this payment stream
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Available Balance:</span>
              <span className="text-lg font-bold">
                {balanceLoading
                  ? "Loading..."
                  : `${formattedMax} ${tokenInfo.symbol}`}
              </span>
            </div>
          </div>

          {/* <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <strong>Note:</strong> This will withdraw all available balance ({formattedMax} {tokenInfo.symbol}). Partial withdrawals are not supported.
            </p>
          </div> */}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending || isConfirming}>
            Cancel
          </Button>
          <Button
            onClick={handleWithdraw}
            disabled={isPending || isConfirming || balanceLoading || maxAmount === 0n}
          >
            {isPending || isConfirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isConfirming ? "Confirming..." : "Processing..."}
              </>
            ) : (
              "Withdraw"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

