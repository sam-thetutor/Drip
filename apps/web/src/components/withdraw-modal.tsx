"use client";

import { useAccount } from "wagmi";
import { useRecipientBalance } from "@/lib/contracts";
import { useDrip } from "@/lib/contracts";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { formatTokenAmount } from "@/lib/utils/format";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const { balance, isLoading: balanceLoading } = useRecipientBalance(streamId, recipient);
  const { withdrawFromStream, isPending, isConfirming } = useDrip();
  const [amount, setAmount] = useState<string>("");
  const [withdrawAll, setWithdrawAll] = useState(true);

  // Get token info for formatting
  const tokenInfo = getTokenByAddress(token, chainId) || { decimals: 18, symbol: "CELO" };

  const maxAmount = (typeof balance === 'bigint' ? balance : 0n);
  const formattedMax = formatTokenAmount(maxAmount, tokenInfo.decimals);

  const handleWithdraw = async () => {
    if (!address || address.toLowerCase() !== recipient.toLowerCase()) {
      toast.error("You can only withdraw your own balance");
      return;
    }

    try {
      let withdrawAmount = 0n;
      
      if (withdrawAll) {
        withdrawAmount = 0n; // 0 means withdraw all
      } else {
        if (!amount || parseFloat(amount) <= 0) {
          toast.error("Please enter a valid amount");
          return;
        }
        withdrawAmount = tokenInfo.decimals === 18
          ? parseEther(amount)
          : parseUnits(amount, tokenInfo.decimals);
        
        if (withdrawAmount > maxAmount) {
          toast.error("Amount exceeds available balance");
          return;
        }
      }

      toast.loading("Processing withdrawal...", { id: "withdraw" });
      await withdrawFromStream(streamId, recipient, withdrawAmount);
      toast.success("Withdrawal successful!", { id: "withdraw" });
      onClose();
    } catch (error: any) {
      toast.error(error?.message || "Failed to withdraw", { id: "withdraw" });
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

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="withdraw-all"
                checked={withdrawAll}
                onChange={(e) => {
                  setWithdrawAll(e.target.checked);
                  if (e.target.checked) setAmount("");
                }}
                className="rounded border-gray-300"
              />
              <Label htmlFor="withdraw-all" className="cursor-pointer">
                Withdraw all available balance
              </Label>
            </div>

            {!withdrawAll && (
              <div className="space-y-2">
                <Label htmlFor="amount">Amount ({tokenInfo.symbol})</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.000001"
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  max={formattedMax}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(formattedMax)}
                  className="w-full"
                >
                  Use Maximum
                </Button>
              </div>
            )}
          </div>
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

