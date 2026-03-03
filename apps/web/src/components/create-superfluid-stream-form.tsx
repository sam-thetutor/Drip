"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAccount, useChainId, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { parseEther, erc20Abi, maxUint256 } from "viem";
import { SUPERFLUID_GDA_ABI } from "@/lib/contracts/superfluid.abi";
import { getContractAddress } from "@/lib/contracts/config";

const superfluidStreamSchema = z.object({
  recipients: z
    .array(
      z.object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
        tokensPerHour: z.string().min(1, "Amount required").refine(
          (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
          "Must be a positive number"
        ),
      })
    )
    .min(1, "At least one recipient required"),
  durationHours: z.string().min(1, "Duration required").refine(
    (val) => !isNaN(parseInt(val)) && parseInt(val) > 0 && parseInt(val) <= 8760, // Max 1 year
    "Must be between 1 and 8760 hours"
  ),
  title: z.string().min(1, "Title required").max(120, "Title too long"),
  description: z.string().max(1024, "Description too long").optional(),
});

type SuperfluidStreamFormData = z.infer<typeof superfluidStreamSchema>;

// GoodDollar SuperToken address on Celo mainnet
const GOODDOLLAR_SUPERTOKEN = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";

export function CreateSuperfluidStreamForm() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId, 'DripCoreSuperfluid');
  
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // Approval state
  const { writeContract: writeApproval, data: approvalHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApprovingConfirm, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approvalHash });

  const [calculatedDeposit, setCalculatedDeposit] = useState<string>("0");
  const [totalFlowRate, setTotalFlowRate] = useState<string>("0");
  const [needsApproval, setNeedsApproval] = useState(false);

  // Check current allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: GOODDOLLAR_SUPERTOKEN as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && contractAddress ? [address, contractAddress] : undefined,
    query: {
      enabled: !!address && !!contractAddress,
    },
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SuperfluidStreamFormData>({
    resolver: zodResolver(superfluidStreamSchema),
    defaultValues: {
      recipients: [{ address: "", tokensPerHour: "" }],
      durationHours: "720", // 30 days default
      title: "",
      description: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "recipients",
  });

  const watchedFields = watch();

  // Calculate deposit and flow rates
  useEffect(() => {
    const calculateDeposit = () => {
      try {
        const { recipients, durationHours } = watchedFields;
        
        let totalPerHour = 0;
        for (const recipient of recipients) {
          const amount = parseFloat(recipient.tokensPerHour || "0");
          if (!isNaN(amount)) {
            totalPerHour += amount;
          }
        }

        const hours = parseInt(durationHours || "0");
        if (isNaN(hours) || hours <= 0) {
          setCalculatedDeposit("0");
          setTotalFlowRate("0");
          return;
        }

        const totalDeposit = totalPerHour * hours;
        setCalculatedDeposit(totalDeposit.toFixed(2));
        setTotalFlowRate(totalPerHour.toFixed(4));

        // Check if approval is needed
        if (allowance !== undefined && totalDeposit > 0) {
          const depositWei = parseEther(totalDeposit.toString());
          setNeedsApproval(allowance < depositWei);
        }
      } catch (e) {
        setCalculatedDeposit("0");
        setTotalFlowRate("0");
      }
    };

    calculateDeposit();
  }, [watchedFields, allowance]);

  // Refetch allowance after approval
  useEffect(() => {
    if (isApproved) {
      refetchAllowance();
      toast.success("Token approval successful! You can now create the stream.");
    }
  }, [isApproved, refetchAllowance]);

  const handleApprove = async () => {
    if (!contractAddress) {
      toast.error("Contract address not available");
      return;
    }

    try {
      toast.info("Approving GoodDollar SuperTokens...");
      
      writeApproval({
        address: GOODDOLLAR_SUPERTOKEN as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [contractAddress, maxUint256], // Approve unlimited
      });
    } catch (error: any) {
      console.error("Error approving tokens:", error);
      toast.error(error.message || "Failed to approve tokens");
    }
  };

  const onSubmit = async (data: SuperfluidStreamFormData) => {
    if (!isConnected || !address) {
      toast.error("Please connect your wallet");
      return;
    }

    if (!contractAddress) {
      toast.error("Superfluid contract not available on this network");
      return;
    }

    try {
      const durationHours = BigInt(parseInt(data.durationHours));
      const periodSeconds = durationHours * 3600n; // Total duration in seconds
      
      // Prepare parameters
      const recipients = data.recipients.map(r => r.address as `0x${string}`);
      
      // Calculate total amount per recipient (tokensPerHour * durationHours)
      const amountsPerPeriod = data.recipients.map(r => {
        const tokensPerHour = parseEther(r.tokensPerHour);
        return tokensPerHour * durationHours; // Total amount for this recipient
      });
      
      // Calculate total deposit (sum of all recipient amounts)
      let totalDeposit = 0n;
      for (const amount of amountsPerPeriod) {
        totalDeposit += amount;
      }

      toast.info(`Creating Superfluid stream via DripCoreSuperfluid contract...`);

      writeContract({
        address: contractAddress,
        abi: SUPERFLUID_GDA_ABI,
        functionName: "createStream",
        args: [
          recipients,
          GOODDOLLAR_SUPERTOKEN,
          amountsPerPeriod,
          periodSeconds,
          totalDeposit,
          data.title,
          data.description || ""
        ],
      });
    } catch (error: any) {
      console.error("Error creating stream:", error);
      toast.error(error.message || "Failed to create stream");
    }
  };

  // Handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash) {
      toast.success("Superfluid stream created successfully!");
      // Refresh page or redirect
      window.location.reload();
    }
    if (writeError) {
      toast.error(`Transaction failed: ${writeError.message}`);
    }
  }, [isConfirmed, hash, writeError]);

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Create Superfluid Stream</CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Create streams through your DripCoreSuperfluid contract ({contractAddress?.slice(0, 6)}...{contractAddress?.slice(-4)})
        </p>
        <p className="text-xs text-muted-foreground">
          Using GDA pool-based distribution with real-time token flows
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Stream Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Stream Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Monthly Contributor Payments"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <textarea
              id="description"
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Add details about this stream..."
              {...register("description")}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="durationHours">Stream Duration (Hours) *</Label>
            <Input
              id="durationHours"
              type="number"
              placeholder="720"
              {...register("durationHours")}
            />
            <p className="text-xs text-muted-foreground">
              {watchedFields.durationHours && !isNaN(parseInt(watchedFields.durationHours)) 
                ? `≈ ${(parseInt(watchedFields.durationHours) / 24).toFixed(1)} days`
                : "Enter duration in hours"}
            </p>
            {errors.durationHours && (
              <p className="text-sm text-destructive">{errors.durationHours.message}</p>
            )}
          </div>

          {/* Recipients */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Recipients *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ address: "", tokensPerHour: "" })}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Recipient
              </Button>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="space-y-3 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Recipient {index + 1}</span>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`recipients.${index}.address`}>Address</Label>
                  <Input
                    id={`recipients.${index}.address`}
                    placeholder="0x..."
                    {...register(`recipients.${index}.address`)}
                  />
                  {errors.recipients?.[index]?.address && (
                    <p className="text-sm text-destructive">
                      {errors.recipients[index]?.address?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`recipients.${index}.tokensPerHour`}>
                    Tokens Per Hour (G$)
                  </Label>
                  <Input
                    id={`recipients.${index}.tokensPerHour`}
                    type="number"
                    step="0.0001"
                    placeholder="1.0"
                    {...register(`recipients.${index}.tokensPerHour`)}
                  />
                  {errors.recipients?.[index]?.tokensPerHour && (
                    <p className="text-sm text-destructive">
                      {errors.recipients[index]?.tokensPerHour?.message}
                    </p>
                  )}
                  {watchedFields.recipients[index]?.tokensPerHour && (
                    <p className="text-xs text-muted-foreground">
                      ≈ {(parseFloat(watchedFields.recipients[index].tokensPerHour) * 24).toFixed(2)} G$/day
                    </p>
                  )}
                </div>
              </div>
            ))}

            {errors.recipients && typeof errors.recipients === "object" && "message" in errors.recipients && (
              <p className="text-sm text-destructive">{errors.recipients.message as string}</p>
            )}
          </div>

          {/* Summary */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="font-semibold">Stream Summary</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="text-muted-foreground">Total Flow Rate:</span>
              <span className="font-medium">{totalFlowRate} G$/hour</span>
              
              <span className="text-muted-foreground">Total Deposit Required:</span>
              <span className="font-medium text-lg text-primary">{calculatedDeposit} G$</span>
              
              <span className="text-muted-foreground">Duration:</span>
              <span className="font-medium">
                {watchedFields.durationHours ? `${watchedFields.durationHours} hours` : "—"}
              </span>
              
              <span className="text-muted-foreground">Recipients:</span>
              <span className="font-medium">{fields.length}</span>
            </div>
          </div>

          {/* Approval & Submit Buttons */}
          {needsApproval ? (
            <div className="space-y-3">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ You need to approve GoodDollar SuperTokens before creating a stream
                </p>
              </div>
              <Button
                type="button"
                onClick={handleApprove}
                className="w-full"
                size="lg"
                disabled={!isConnected || isApproving || isApprovingConfirm}
              >
                {isApproving || isApprovingConfirm ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isApproving ? "Confirm approval in wallet..." : "Approving tokens..."}
                  </>
                ) : (
                  `Approve GoodDollar SuperTokens`
                )}
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={!isConnected || isPending || isConfirming || parseFloat(calculatedDeposit) === 0}
            >
              {isPending || isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isPending ? "Confirm in wallet..." : "Creating stream..."}
                </>
              ) : (
                <>
                  {!needsApproval && allowance !== undefined && allowance > 0n && (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  {`Create Stream (Deposit ${calculatedDeposit} G$)`}
                </>
              )}
            </Button>
          )}

          {!isConnected && (
            <p className="text-sm text-center text-muted-foreground">
              Connect your wallet to create a stream
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
