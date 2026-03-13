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
import { Plus, X, Loader2, CheckCircle, ChevronRight, ChevronLeft } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Test phone-to-address lookup map.
// Replace / extend these entries to test the feature with real wallets.
// ---------------------------------------------------------------------------
const PHONE_ADDRESS_MAP: Record<string, `0x${string}`> = {
  "+2348012345678": "0x1234567890123456789012345678901234567890",
  "+2347098765432": "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01",
  "+14155552671":   "0xDeAdBeEf00000000000000000000000000000001",
  "+447911123456":  "0xCaFeBaBe00000000000000000000000000000002",
  "+256774073262":  "0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7",
};

export function CreateSuperfluidStreamForm() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId, 'DripCoreSuperfluid');
  
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  // Approval state
  const { writeContract: writeApproval, data: approvalHash, isPending: isApproving } = useWriteContract();
  const { isLoading: isApprovingConfirm, isSuccess: isApproved } = useWaitForTransactionReceipt({ hash: approvalHash });

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [calculatedDeposit, setCalculatedDeposit] = useState<string>("0");
  const [totalFlowRate, setTotalFlowRate] = useState<string>("0");
  const [needsApproval, setNeedsApproval] = useState(false);
  // recipientInputs: raw text the user typed (address or phone)
  const [recipientInputs, setRecipientInputs] = useState<Record<number, string>>({});
  // resolvedFromPhone: the phone string that triggered a match (for green badge)
  const [resolvedFromPhone, setResolvedFromPhone] = useState<Record<number, string | null>>({});
  const [phoneNotFound, setPhoneNotFound] = useState<Record<number, boolean>>({});

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
    setValue,
    trigger,
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

  const handleRecipientInput = (index: number, value: string) => {
    setRecipientInputs((prev) => ({ ...prev, [index]: value }));

    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(value.trim());
    const isPhone   = /^\+[1-9]\d{7,14}$/.test(value.trim());

    if (isAddress) {
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
        setValue(`recipients.${index}.address`, "" as any, {
          shouldDirty: true,
          shouldValidate: false,
        });
        setResolvedFromPhone((prev) => ({ ...prev, [index]: null }));
        setPhoneNotFound((prev) => ({ ...prev, [index]: true }));
      }
      return;
    }

    // Still typing – clear resolved state
    setResolvedFromPhone((prev) => ({ ...prev, [index]: null }));
    setPhoneNotFound((prev) => ({ ...prev, [index]: false }));
  };

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
      window.location.reload();
    }
    if (writeError) {
      toast.error(`Transaction failed: ${writeError.message}`);
    }
  }, [isConfirmed, hash, writeError]);

  const advanceStep = async () => {
    let valid = false;
    if (step === 1) valid = await trigger(["title", "description"]);
    else if (step === 2) valid = await trigger(["recipients"]);
    else if (step === 3) valid = await trigger(["durationHours"]);
    if (valid) setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
  };

  const STEPS = [
    { n: 1, label: "Basics" },
    { n: 2, label: "Recipients" },
    { n: 3, label: "Settings" },
    { n: 4, label: "Review" },
  ] as const;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Create Superfluid Stream</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Contract: {contractAddress?.slice(0, 6)}…{contractAddress?.slice(-4)} · GDA pool distribution
        </p>

        {/* ── Step indicator ── */}
        <div className="flex items-center gap-0 mt-4">
          {STEPS.map((s, i) => {
            const done = step > s.n;
            const active = step === s.n;
            return (
              <>
                <div key={s.n} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                      done
                        ? "bg-primary border-primary text-primary-foreground"
                        : active
                        ? "border-primary text-primary bg-background"
                        : "border-muted-foreground/30 text-muted-foreground/50 bg-background"
                    }`}
                  >
                    {done ? <CheckCircle className="h-4 w-4" /> : s.n}
                  </div>
                  <span
                    className={`text-[10px] font-medium tracking-wide ${
                      active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground/50"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mb-4 mx-1 transition-colors ${
                      step > s.n ? "bg-primary" : "bg-muted-foreground/20"
                    }`}
                  />
                )}
              </>
            );
          })}
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* ── Step 1: Basics ── */}
          <div className={step !== 1 ? "hidden" : "space-y-4"}>
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

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <textarea
                id="description"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Add details about this stream..."
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>
          </div>

          {/* ── Step 2: Recipients ── */}
          <div className={step !== 2 ? "hidden" : "space-y-4"}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Add one or more recipients by wallet address or phone number.</p>
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
                    <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`recipient-input-${index}`}>Address or Phone</Label>
                  <Input
                    id={`recipient-input-${index}`}
                    placeholder="0x… wallet address or +2348… phone"
                    value={recipientInputs[index] ?? ""}
                    onChange={(e) => handleRecipientInput(index, e.target.value)}
                  />
                  <input type="hidden" {...register(`recipients.${index}.address`)} />

                  {resolvedFromPhone[index] && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                      ✓ Resolved from {resolvedFromPhone[index]} →{" "}
                      <span className="font-mono">
                        {watchedFields.recipients[index]?.address?.slice(0, 6)}…
                        {watchedFields.recipients[index]?.address?.slice(-4)}
                      </span>
                    </p>
                  )}
                  {phoneNotFound[index] && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      ⚠ No address mapping found for this number
                    </p>
                  )}
                  {errors.recipients?.[index]?.address && !resolvedFromPhone[index] && !phoneNotFound[index] && (
                    <p className="text-sm text-destructive">
                      {errors.recipients[index]?.address?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`recipients.${index}.tokensPerHour`}>Tokens Per Hour (G$)</Label>
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

          {/* ── Step 3: Settings ── */}
          <div className={step !== 3 ? "hidden" : "space-y-4"}>
            <p className="text-sm text-muted-foreground">
              How long should this stream run?
            </p>
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
          </div>

          {/* ── Step 4: Review & Submit ── */}
          <div className={step !== 4 ? "hidden" : "space-y-4"}>
            {/* Stream info */}
            <div className="rounded-lg border p-4 space-y-1">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Stream</p>
              <p className="font-semibold">{watchedFields.title || <span className="text-muted-foreground italic">Untitled</span>}</p>
              {watchedFields.description && (
                <p className="text-sm text-muted-foreground">{watchedFields.description}</p>
              )}
            </div>

            {/* Recipients summary */}
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Recipients ({fields.length})</p>
              {watchedFields.recipients.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs text-muted-foreground truncate max-w-[180px]">
                    {resolvedFromPhone[i]
                      ? `${resolvedFromPhone[i]} → ${r.address?.slice(0, 6)}…${r.address?.slice(-4)}`
                      : r.address
                      ? `${r.address.slice(0, 6)}…${r.address.slice(-4)}`
                      : <span className="text-destructive">missing address</span>}
                  </span>
                  <span className="font-medium ml-4 shrink-0">
                    {r.tokensPerHour ? `${r.tokensPerHour} G$/hr` : "—"}
                  </span>
                </div>
              ))}
            </div>

            {/* Financials summary */}
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Summary</p>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium text-right">
                  {watchedFields.durationHours
                    ? `${watchedFields.durationHours} hrs (≈ ${(parseInt(watchedFields.durationHours) / 24).toFixed(1)} days)`
                    : "—"}
                </span>
                <span className="text-muted-foreground">Total flow rate</span>
                <span className="font-medium text-right">{totalFlowRate} G$/hr</span>
                <span className="text-muted-foreground">Total deposit</span>
                <span className="font-semibold text-right text-primary">{calculatedDeposit} G$</span>
                <span className="text-muted-foreground">Token approval</span>
                <span className="text-right">
                  {needsApproval ? (
                    <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Required</span>
                  ) : (
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Ready</span>
                  )}
                </span>
              </div>
            </div>

            {/* Approval notice */}
            {needsApproval && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ You need to approve GoodDollar SuperTokens before creating a stream.
                </p>
              </div>
            )}

            {!isConnected && (
              <p className="text-sm text-center text-muted-foreground">
                Connect your wallet to create a stream
              </p>
            )}
          </div>

          {/* ── Navigation ── */}
          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>

            {step < 4 && (
              <Button type="button" onClick={advanceStep}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 4 && (
              needsApproval ? (
                <Button
                  type="button"
                  onClick={handleApprove}
                  disabled={!isConnected || isApproving || isApprovingConfirm}
                >
                  {isApproving || isApprovingConfirm ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isApproving ? "Confirm in wallet…" : "Approving…"}</>
                  ) : (
                    "Approve G$ Tokens"
                  )}
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!isConnected || isPending || isConfirming || parseFloat(calculatedDeposit) === 0}
                >
                  {isPending || isConfirming ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isPending ? "Confirm in wallet…" : "Creating…"}</>
                  ) : (
                    <>
                      {allowance !== undefined && allowance > 0n && <CheckCircle className="mr-2 h-4 w-4" />}
                      Create Stream ({calculatedDeposit} G$)
                    </>
                  )}
                </Button>
              )
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
