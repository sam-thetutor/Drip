"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAccount, useChainId } from "wagmi";
import { useDrip } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TokenSelector, getTokenByAddress } from "@/components/token-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseEther, formatEther } from "viem";
import { useRouter } from "next/navigation";

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
  periodDays: z.string().min(1, "Period required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Must be a positive number"
  ),
  totalPeriods: z.string().min(1, "Total periods required").refine(
    (val) => !isNaN(parseInt(val)) && parseInt(val) > 0,
    "Must be a positive integer"
  ),
  title: z.string().max(120, "Title too long").optional(),
  description: z.string().max(1024, "Description too long").optional(),
});

type StreamFormData = z.infer<typeof streamSchema>;

export function CreateStreamForm() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const router = useRouter();
  const { createStream, isPending, isConfirming, isConfirmed, hash } = useDrip();
  const [calculatedDeposit, setCalculatedDeposit] = useState<string>("0");

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
      periodDays: "1",
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
  const watchedPeriodDays = watch("periodDays");
  const watchedTotalPeriods = watch("totalPeriods");

  // Calculate deposit when values change
  useEffect(() => {
    try {
      const token = getTokenByAddress(watchedToken as `0x${string}`, chainId);
      if (!token) {
        setCalculatedDeposit("0");
        return;
      }

      const totalAmountPerPeriod = watchedRecipients.reduce((sum, recipient) => {
        return sum + parseFloat(recipient.amountPerPeriod || "0");
      }, 0);

      const totalPeriods = parseInt(watchedTotalPeriods || "30");

      // Calculate total deposit: amount per period * number of periods
      const totalDeposit = totalAmountPerPeriod * totalPeriods;

      setCalculatedDeposit(totalDeposit.toFixed(6));
    } catch (error) {
      setCalculatedDeposit("0");
    }
  }, [watchedRecipients, watchedToken, watchedTotalPeriods, chainId]);

  const onSubmit = async (data: StreamFormData) => {
    if (!isConnected || !address) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      const token = getTokenByAddress(data.token as `0x${string}`, chainId);
      if (!token) {
        toast.error("Invalid token selected");
        return;
      }

      const periodSeconds = parseFloat(data.periodDays) * 24 * 60 * 60;
      const recipients = data.recipients.map((r) => r.address as `0x${string}`);
      const amountsPerPeriod = data.recipients.map((r) => r.amountPerPeriod);

      toast.loading("Creating stream...", { id: "create-stream" });

      await createStream(
        recipients,
        data.token as `0x${string}`,
        amountsPerPeriod,
        periodSeconds,
        calculatedDeposit,
        data.title || "",
        data.description || ""
      );

      toast.success("Stream created! Transaction submitted.", { id: "create-stream" });
      
      // Wait for confirmation
      if (hash) {
        toast.info("Waiting for confirmation...", { id: "confirm-stream" });
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to create stream", { id: "create-stream" });
    }
  };

  // Watch for transaction confirmation
  if (isConfirmed && hash) {
    toast.success("Stream created successfully!", { id: "confirm-stream" });
    setTimeout(() => {
      router.push("/streams");
    }, 2000);
  }

  if (!isConnected) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Please connect your wallet to create a stream
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-4 items-start">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`recipient-${index}`}>
                  Recipient {index + 1} Address
                </Label>
                <Input
                  id={`recipient-${index}`}
                  placeholder="0x..."
                  {...register(`recipients.${index}.address`)}
                />
                {errors.recipients?.[index]?.address && (
                  <p className="text-sm text-destructive">
                    {errors.recipients[index]?.address?.message}
                  </p>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`amount-${index}`}>
                  Amount per Period
                </Label>
                <Input
                  id={`amount-${index}`}
                  type="number"
                  step="0.000001"
                  placeholder="0.0"
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
                  className="mt-8"
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
            Add Recipient
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stream Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">Payment Token</Label>
            <TokenSelector
              value={watchedToken as `0x${string}`}
              onValueChange={(value) => {
                setValue("token", value);
              }}
            />
            {errors.token && (
              <p className="text-sm text-destructive">{errors.token.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="periodDays">Period Duration (Days)</Label>
              <Input
                id="periodDays"
                type="number"
                step="0.1"
                min="0.1"
                placeholder="1"
                {...register("periodDays")}
              />
              {errors.periodDays && (
                <p className="text-sm text-destructive">
                  {errors.periodDays.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="totalPeriods">Total Periods</Label>
              <Input
                id="totalPeriods"
                type="number"
                min="1"
                placeholder="30"
                {...register("totalPeriods")}
              />
              {errors.totalPeriods && (
                <p className="text-sm text-destructive">
                  {errors.totalPeriods.message}
                </p>
              )}
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Total Deposit:</span>
              <span className="text-lg font-bold">{calculatedDeposit} {getTokenByAddress(watchedToken as `0x${string}`, chainId)?.symbol || "CELO"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Optional Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title (Optional)</Label>
            <Input
              id="title"
              placeholder="e.g., Monthly Salary"
              maxLength={120}
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
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Add a description for this stream..."
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

      <div className="flex gap-4">
        <Button
          type="submit"
          disabled={isPending || isConfirming}
          className="flex-1"
        >
          {isPending || isConfirming ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isConfirming ? "Confirming..." : "Creating..."}
            </>
          ) : (
            "Create Stream"
          )}
        </Button>
      </div>
    </form>
  );
}

