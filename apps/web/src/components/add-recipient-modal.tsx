"use client";

import { useState, useEffect } from "react";
import { useDrip } from "@/lib/contracts";
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
import { isAddress } from "viem";

interface AddRecipientModalProps {
  streamId: bigint;
  token: `0x${string}`;
  periodSeconds: number;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddRecipientModal({
  streamId,
  token,
  periodSeconds,
  onClose,
  onSuccess,
}: AddRecipientModalProps) {
  const chainId = useChainId();
  const { addRecipient, isPending, isConfirming, isConfirmed, hash, error } = useDrip();
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amountPerPeriod, setAmountPerPeriod] = useState("");

  const tokenInfo = getTokenByAddress(token, chainId) || { decimals: 18, symbol: "Token" };

  // Derive rate per hour for display (amountPerPeriod / periodSeconds * 3600)
  const ratePerHour = (() => {
    const amt = parseFloat(amountPerPeriod);
    if (!amt || amt <= 0 || periodSeconds <= 0) return null;
    return (amt / periodSeconds) * 3600;
  })();

  useEffect(() => {
    if (hash && !isPending) {
      toast.loading("Waiting for confirmation...", { id: "add-recipient" });
    }
  }, [hash, isPending]);

  useEffect(() => {
    if (isConfirmed && hash) {
      toast.success("Recipient added successfully!", { id: "add-recipient" });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 500);
    }
  }, [isConfirmed, hash, onSuccess, onClose]);

  useEffect(() => {
    if (error) {
      toast.error(error?.message || "Failed to add recipient", {
        id: "add-recipient",
        duration: 5000,
      });
    }
  }, [error]);

  const handleAdd = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (!isAddress(recipientAddress)) {
      toast.error("Please enter a valid recipient address");
      return;
    }
    if (!amountPerPeriod || parseFloat(amountPerPeriod) <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    try {
      toast.loading("Adding recipient...", { id: "add-recipient" });
      // additionalDeposit = "0" — stream already has funds deposited
      await addRecipient(streamId, recipientAddress as `0x${string}`, amountPerPeriod, "0", token);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add recipient", {
        id: "add-recipient",
        duration: 5000,
      });
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => {
      if (!open && !isPending && !isConfirming) onClose();
    }}>
      <DialogContent onInteractOutside={(e) => {
        if (isPending || isConfirming) e.preventDefault();
      }}>
        <DialogHeader>
          <DialogTitle>Add Recipient</DialogTitle>
          <DialogDescription>
            Add a new recipient to receive a share of this stream.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Address</Label>
            <Input
              id="recipient"
              placeholder="0x..."
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">
              Total allocation for full stream duration ({tokenInfo.symbol})
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.000001"
              min="0"
              placeholder="0.0"
              value={amountPerPeriod}
              onChange={(e) => setAmountPerPeriod(e.target.value)}
            />
            {ratePerHour !== null && (
              <p className="text-xs text-muted-foreground">
                ≈ {ratePerHour.toFixed(4)} {tokenInfo.symbol}/hr
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={(e) => { e.preventDefault(); onClose(); }}
            disabled={isPending || isConfirming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={isPending || isConfirming || !recipientAddress || !amountPerPeriod}
            type="button"
          >
            {isPending || isConfirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isConfirming ? "Confirming..." : "Processing..."}
              </>
            ) : (
              "Add Recipient"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

