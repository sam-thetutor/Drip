"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAccount, useChainId } from "wagmi";
import { useDrip } from "@/lib/contracts";
import { useEngagementRewards } from "@/lib/gooddollar/hooks/useEngagementRewards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenSelector, getTokenByAddress } from "@/components/token-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseEther, formatEther, parseUnits, formatUnits, maxUint256 } from "viem";
import { useRouter, useSearchParams } from "next/navigation";

const streamSchema = z.object({
  recipients: z
    .array(
      z.object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
        amountPerPeriod: z.string().min(1, "Amount required").refine(
          (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
          "Must be a positive number"
        ),
      })
    )
    .min(1, "At least one recipient required"),
  token: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Token required"),
  cadence: z.enum(["per_minute", "hourly", "daily", "weekly", "monthly", "quarterly"], {
    required_error: "Choose how often it should drip",
  }),
  totalPeriods: z.string().min(1, "Total periods required").refine(
    (val) => !isNaN(parseInt(val)) && parseInt(val) > 0,
    "Must be a positive integer"
  ),
  title: z.string().max(120, "Title too long").optional(),
  description: z.string().max(1024, "Description too long").optional(),
});

type StreamFormData = z.infer<typeof streamSchema>;

type CadenceOption = StreamFormData["cadence"];

// ---------------------------------------------------------------------------
// Test phone-to-address lookup map.
// Replace / extend these entries to test the feature with real wallets.
// ---------------------------------------------------------------------------
const PHONE_ADDRESS_MAP: Record<string, `0x${string}`> = {
  "+2348012345678": "0x1234567890123456789012345678901234567890",
  "+2347098765432": "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
  "+14155552671":   "0xDeAdBeEf00000000000000000000000000000001",
  "+447911123456":  "0xCaFeBaBe00000000000000000000000000000002",
};

export function CreateStreamForm() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createStream, approveToken, checkTokenAllowance, isPending, isConfirming, isConfirmed, hash } = useDrip();
  const { 
    engagementRewards, 
    isReady: isEngagementRewardsReady, 
    isUserRegistered, 
    signClaim, 
    getCurrentBlockNumber 
  } = useEngagementRewards();
  const [calculatedDeposit, setCalculatedDeposit] = useState<string>("0");
  const [needsApproval, setNeedsApproval] = useState<boolean>(false);
  const [approvalAmount, setApprovalAmount] = useState<string>("0");
  // recipientInputs: raw text the user typed (address or phone)
  const [recipientInputs, setRecipientInputs] = useState<Record<number, string>>({});
  // resolvedFromPhone: the phone string that successfully resolved for each index
  const [resolvedFromPhone, setResolvedFromPhone] = useState<Record<number, string | null>>({});
  const [phoneNotFound, setPhoneNotFound] = useState<Record<number, boolean>>({});
  
  // Get inviter from URL params (for referral links)
  const inviterFromUrl = searchParams?.get("inviter") as `0x${string}` | null;
  
  // Get inviter from localStorage (if previously set)
  const [inviter, setInviter] = useState<`0x${string}` | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("drip_inviter");
      if (stored && /^0x[a-fA-F0-9]{40}$/.test(stored)) {
        return stored as `0x${string}`;
      }
    }
    return inviterFromUrl;
  });

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StreamFormData>({
    resolver: zodResolver(streamSchema),
    defaultValues: {
      recipients: [{ address: "", amountPerPeriod: "" }],
      token: "0x0000000000000000000000000000000000000000", // Default to CELO
      cadence: "monthly",
      totalPeriods: "30",
      title: "",
      description: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "recipients",
  });

  const watchedRecipients = watch("recipients");
  const watchedToken = watch("token");
  const watchedTotalPeriods = watch("totalPeriods");

  // Check if approval is needed when token or deposit changes
  useEffect(() => {
    const checkApproval = async () => {
      if (!isConnected || !address || !watchedToken || calculatedDeposit === "0") {
        setNeedsApproval(false);
        return;
      }

      const isNativeToken = watchedToken === "0x0000000000000000000000000000000000000000";
      if (isNativeToken) {
        setNeedsApproval(false);
        return;
      }

      try {
        const token = getTokenByAddress(watchedToken as `0x${string}`, chainId);
        if (!token) {
          setNeedsApproval(false);
          return;
        }

        const depositInWei = parseUnits(calculatedDeposit, token.decimals);
        // Calculate total needed (deposit + platform fee of 0.5%)
        const platformFeeBps = 50;
        const totalNeeded = (depositInWei * BigInt(10000)) / BigInt(10000 - platformFeeBps);

        const hasAllowance = await checkTokenAllowance(watchedToken as `0x${string}`, totalNeeded);
        setNeedsApproval(!hasAllowance);
        
        if (!hasAllowance) {
          setApprovalAmount(formatUnits(totalNeeded, token.decimals));
        }
      } catch (error) {
        console.error("Error checking approval:", error);
        setNeedsApproval(false);
      }
    };

    // Add a small delay to avoid too many calls
    const timeoutId = setTimeout(checkApproval, 500);
    return () => clearTimeout(timeoutId);
  }, [watchedToken, calculatedDeposit, isConnected, address, chainId]); // Removed checkTokenAllowance from deps

  // Calculate deposit when values change
  useEffect(() => {
    try {
      const token = getTokenByAddress(watchedToken as `0x${string}`, chainId);
      if (!token) {
        setCalculatedDeposit("0");
        return;
      }

      // Calculate total amount per period from all recipients
      const totalAmountPerPeriod = watchedRecipients.reduce((sum, recipient) => {
        const amount = parseFloat(recipient.amountPerPeriod || "0");
        if (isNaN(amount) || amount <= 0) return sum;
        return sum + amount;
      }, 0);

      if (totalAmountPerPeriod <= 0) {
        setCalculatedDeposit("0");
        return;
      }

      const totalPeriods = parseInt(watchedTotalPeriods || "30");
      if (isNaN(totalPeriods) || totalPeriods <= 0) {
        setCalculatedDeposit("0");
        return;
      }

      // Calculate total deposit: amount per period * number of periods
      const totalDeposit = totalAmountPerPeriod * totalPeriods;

      // Format based on token decimals to avoid rounding issues
      // Use the token's actual decimals, but ensure we don't lose precision
      const decimals = token.decimals;
      // For tokens with more than 6 decimals, we'll still show up to 6 for readability
      // but the actual precision is preserved in the calculation
      const displayDecimals = Math.min(decimals, 18);
      const formattedDeposit = totalDeposit.toFixed(displayDecimals);
      
      // Ensure it's not zero
      const depositValue = parseFloat(formattedDeposit);
      if (isNaN(depositValue) || depositValue <= 0) {
        setCalculatedDeposit("0");
        return;
      }

      // For very small amounts, ensure we don't lose precision
      // If the formatted value is 0 but the original isn't, use more precision
      if (depositValue === 0 && totalDeposit > 0) {
        // Use full precision for very small amounts
        setCalculatedDeposit(totalDeposit.toFixed(decimals));
      } else {
        setCalculatedDeposit(formattedDeposit);
      }
    } catch (error) {
      console.error("Error calculating deposit:", error);
      setCalculatedDeposit("0");
    }
  }, [watchedRecipients, watchedToken, watchedTotalPeriods, chainId]);

  const handleApprove = async () => {
    if (!isConnected || !address || !watchedToken || calculatedDeposit === "0") {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const token = getTokenByAddress(watchedToken as `0x${string}`, chainId);
      if (!token) {
        toast.error("Invalid token selected");
        return;
      }

      const depositInWei = parseUnits(calculatedDeposit, token.decimals);
      // Calculate total needed (deposit + platform fee of 0.5%)
      const platformFeeBps = 50;
      const totalNeeded = (depositInWei * BigInt(10000)) / BigInt(10000 - platformFeeBps);

      toast.loading("Approving token...", { id: "approve-token" });
      
      await approveToken(watchedToken as `0x${string}`, maxUint256); // Approve max for convenience
      
      toast.success("Token approved successfully!", { id: "approve-token" });
      setNeedsApproval(false);
    } catch (error: any) {
      toast.error(error?.message || "Failed to approve token", { id: "approve-token" });
    }
  };

  const onSubmit = async (data: StreamFormData) => {
    if (!isConnected || !address) {
      toast.error("Please connect your wallet");
      return;
    }

    // Check if approval is needed
    if (needsApproval) {
      toast.error("Please approve token spending first");
      return;
    }

    // Validate deposit
    if (!calculatedDeposit || calculatedDeposit === "0" || parseFloat(calculatedDeposit) <= 0) {
      toast.error("Invalid deposit amount. Please check recipient amounts and periods.");
      return;
    }

    // Validate recipients have amounts
    const hasValidRecipients = data.recipients.every(
      (r) => r.address && r.amountPerPeriod && parseFloat(r.amountPerPeriod) > 0
    );
    if (!hasValidRecipients) {
      toast.error("Please ensure all recipients have valid addresses and amounts");
      return;
    }

    try {
      const token = getTokenByAddress(data.token as `0x${string}`, chainId);
      if (!token) {
        toast.error("Invalid token selected");
        return;
      }

      const cadenceToSeconds: Record<CadenceOption, number> = {
        per_minute: 60,
        hourly: 60 * 60,
        daily: 24 * 60 * 60,
        weekly: 7 * 24 * 60 * 60,
        monthly: 30 * 24 * 60 * 60,
        quarterly: 90 * 24 * 60 * 60,
      };

      // Calculate total stream duration: period duration * number of periods
      const periodDuration = cadenceToSeconds[data.cadence];
      const totalPeriods = parseInt(data.totalPeriods || "1");
      const periodSeconds = periodDuration * totalPeriods;
      const recipients = data.recipients.map((r) => r.address as `0x${string}`);
      const amountsPerPeriod = data.recipients.map((r) => r.amountPerPeriod);

      // Validate amounts are not empty
      if (amountsPerPeriod.some((amt) => !amt || parseFloat(amt) <= 0)) {
        toast.error("All recipient amounts must be greater than 0");
        return;
      }

      console.log("Creating stream with:", {
        recipients,
        token: data.token,
        amountsPerPeriod,
        periodSeconds,
        deposit: calculatedDeposit,
        tokenDecimals: token.decimals,
      });

      toast.loading("Creating stream...", { id: "create-stream" });

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
                toast.error("Failed to generate signature. Stream will be created without engagement rewards.", {
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

      await createStream(
        recipients,
        data.token as `0x${string}`,
        amountsPerPeriod,
        periodSeconds,
        calculatedDeposit,
        data.title || "",
        data.description || "",
        engagementRewardsParams.inviter,
        engagementRewardsParams.validUntilBlock,
        engagementRewardsParams.signature
      );

      // Transaction submitted - wait for confirmation
      toast.loading("Waiting for confirmation...", { id: "create-stream" });
    } catch (error: any) {
      const errorMessage = error?.message || "Failed to create stream";
      if (errorMessage.includes("Insufficient token approval")) {
        setNeedsApproval(true);
        toast.error(errorMessage, { id: "create-stream", duration: 5000 });
      } else {
        toast.error(errorMessage, { id: "create-stream" });
      }
    }
  };

  const handleRecipientInput = (index: number, value: string) => {
    setRecipientInputs((prev) => ({ ...prev, [index]: value }));

    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(value.trim());
    const isPhone   = /^\+[1-9]\d{7,14}$/.test(value.trim());

    if (isAddress) {
      // Direct address paste – use it straight away
      setValue(`recipients.${index}.address`, value.trim() as `0x${string}`, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setResolvedFromPhone((prev) => ({ ...prev, [index]: null }));
      setPhoneNotFound((prev) => ({ ...prev, [index]: false }));
      return;
    }

    if (isPhone) {
      const mapped = PHONE_ADDRESS_MAP[value.trim()];
      if (mapped) {
        setValue(`recipients.${index}.address`, mapped, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setResolvedFromPhone((prev) => ({ ...prev, [index]: value.trim() }));
        setPhoneNotFound((prev) => ({ ...prev, [index]: false }));
      } else {
        // Phone recognised as valid format but not in the map
        setValue(`recipients.${index}.address`, "" as any, {
          shouldDirty: true,
          shouldValidate: false,
        });
        setResolvedFromPhone((prev) => ({ ...prev, [index]: null }));
        setPhoneNotFound((prev) => ({ ...prev, [index]: true }));
      }
      return;
    }

    // Still typing – clear resolved state, don't touch address yet
    setResolvedFromPhone((prev) => ({ ...prev, [index]: null }));
    setPhoneNotFound((prev) => ({ ...prev, [index]: false }));
  };

  // Watch for transaction confirmation
  useEffect(() => {
  if (isConfirmed && hash) {
      toast.success("Stream created successfully!", { id: "create-stream" });
    setTimeout(() => {
      router.push("/streams");
    }, 2000);
  }
  }, [isConfirmed, hash, router]);

  if (!isConnected) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Connect your wallet to set up a payment stream.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Row: basics + schedule (2 columns on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Stream basics */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Stream basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Give this stream a short name and an optional description so you and your team
              know what it&apos;s for.
            </p>

            <div className="space-y-2">
              <Label htmlFor="title">Stream name</Label>
              <Input
                id="title"
                placeholder="e.g. Team Salary – Engineering"
                maxLength={120}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">What is this stream for? (optional)</Label>
              <textarea
                id="description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Short note for your future self or your team…"
                maxLength={1024}
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">
                  {errors.description.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3. Schedule & funding */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Schedule &amp; funding</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Payment token</Label>
              <TokenSelector
                value={watchedToken as `0x${string}`}
                onValueChange={(value) => {
                  setValue("token", value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Choose what you&apos;re streaming (CELO, cUSD, USDC…).
              </p>
              {errors.token && (
                <p className="text-sm text-destructive">{errors.token.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cadence">How often should it drip?</Label>
                <select
                  id="cadence"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register("cadence")}
                >
                  <option value="per_minute">Every minute</option>
                  <option value="hourly">Every hour</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                  <option value="quarterly">Every quarter</option>
                </select>
                {errors.cadence && (
                  <p className="text-sm text-destructive">
                    {errors.cadence.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="totalPeriods">Number of payments</Label>
                <Input
                  id="totalPeriods"
                  type="number"
                  min="1"
                  placeholder="e.g. 12"
                  {...register("totalPeriods")}
                />
                {errors.totalPeriods && (
                  <p className="text-sm text-destructive">
                    {errors.totalPeriods.message}
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">You&apos;ll deposit now</span>
                <span className="text-lg font-bold">
                  {calculatedDeposit}{" "}
                  {getTokenByAddress(watchedToken as `0x${string}`, chainId)?.symbol ||
                    "CELO"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Total deposit = total per period × number of payments. You can top up or stop
                the stream later.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Recipients & amounts */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recipients &amp; amounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add one or more wallets and how much each receives per period.
          </p>

          <div className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_auto] gap-4 text-xs text-muted-foreground px-1">
            <span>Recipient address or phone number</span>
            <span>Amount per period</span>
            <span className="sr-only">Actions</span>
          </div>

          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-[minmax(0,2.5fr)_minmax(0,1.5fr)_auto] gap-4 items-start"
            >
              <div className="space-y-1.5">
                <Input
                  id={`recipient-${index}`}
                  placeholder="0x… wallet address or +2348… phone"
                  value={recipientInputs[index] ?? ""}
                  onChange={(e) => handleRecipientInput(index, e.target.value)}
                />
                {/* Hidden field to keep RHF in sync */}
                <input type="hidden" {...register(`recipients.${index}.address`)} />

                {/* Resolved-from-phone badge */}
                {resolvedFromPhone[index] && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    ✓ Resolved from {resolvedFromPhone[index]} →{" "}
                    <span className="font-mono">
                      {watch(`recipients.${index}.address`).slice(0, 6)}…
                      {watch(`recipients.${index}.address`).slice(-4)}
                    </span>
                  </p>
                )}

                {/* Phone not found warning */}
                {phoneNotFound[index] && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠ No address mapping found for this number
                  </p>
                )}

                {/* Address validation error */}
                {errors.recipients?.[index]?.address && !resolvedFromPhone[index] && !phoneNotFound[index] && (
                  <p className="text-sm text-destructive">
                    {errors.recipients[index]?.address?.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Input
                  id={`amount-${index}`}
                  type="number"
                  step="0.000001"
                  placeholder="e.g. 100"
                  {...register(`recipients.${index}.amountPerPeriod`)}
                />
                {errors.recipients?.[index]?.amountPerPeriod && (
                  <p className="text-sm text-destructive">
                    {errors.recipients[index]?.amountPerPeriod?.message}
                  </p>
                )}
              </div>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  className="mt-1"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            onClick={() => append({ address: "", amountPerPeriod: "" })}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add another recipient
          </Button>

          <div className="mt-2 text-xs text-muted-foreground">
            Total per period is calculated from all recipients above.
          </div>
        </CardContent>
      </Card>

      {/* Token Approval Notice */}
      {needsApproval && watchedToken !== "0x0000000000000000000000000000000000000000" && (
        <Card className="glass-card border-yellow-500/30 bg-yellow-500/10">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-600 mb-2">Token Approval Required</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Before creating a stream with {getTokenByAddress(watchedToken as `0x${string}`, chainId)?.symbol || "this token"}, 
                  you need to approve the DripCore contract to spend your tokens.
                </p>
                <p className="text-xs text-muted-foreground">
                  Required approval: {approvalAmount} {getTokenByAddress(watchedToken as `0x${string}`, chainId)?.symbol || "tokens"}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleApprove}
                disabled={isPending || isConfirming}
                variant="outline"
                className="border-yellow-500 text-yellow-600 hover:bg-yellow-500/20"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Approving...
                  </>
                ) : (
                  "Approve Token"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4">
        <Button
          type="submit"
          disabled={isPending || isConfirming || needsApproval}
          className="flex-1"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isConfirming ? "Confirming..." : "Creating..."}
            </>
          ) : needsApproval ? (
            "Approve Token First"
          ) : (
            "Create Stream"
          )}
        </Button>
      </div>
    </form>
  );
}

