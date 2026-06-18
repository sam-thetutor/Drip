"use client";

import { useAccount, useChainId } from "wagmi";
import {
  User,
  Shield,
  Copy,
  Check,
  Settings,
  Bell,
  Palette,
  HelpCircle,
  Phone,
  Link2,
  Unlink2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { IdentityStatus } from "@/components/gooddollar/identity-status";
import { FaceVerification } from "@/components/gooddollar/face-verification";
import { InviteLinkGenerator } from "@/components/gooddollar/invite-link-generator";
import { isSupportedChain } from "@/lib/gooddollar/utils";
import { usePhoneMapping } from "@/lib/contracts";
import { decryptPhoneFromOnchain, encryptPhoneForOnchain } from "@/lib/phone/crypto";
import { hashPhoneE164 } from "@/lib/phone/hash";
import { toast } from "sonner";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [copied, setCopied] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [encryptionPassphrase, setEncryptionPassphrase] = useState("");
  const [decryptPassphrase, setDecryptPassphrase] = useState("");
  const [pendingAction, setPendingAction] = useState<"register" | "unregister" | null>(null);
  const [mappedPhoneDisplay, setMappedPhoneDisplay] = useState<string | null>(null);
  const {
    registerPhoneSecure,
    unregisterPhone,
    hasMappedPhoneHash,
    isPhoneHashRegistered,
    resolveAddressByPhoneHash,
    refetchMappedPhoneHash,
    refetchIsAddressRegistered,
    encryptedPhoneData,
    refetchEncryptedPhoneData,
    isPending: isPhoneWritePending,
    isConfirming: isPhoneWriteConfirming,
    isConfirmed: isPhoneWriteConfirmed,
    error: phoneWriteError,
  } = usePhoneMapping();

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast.success("Address copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const isGoodDollarChain = isSupportedChain(chainId);

  const isPhoneBusy = isPhoneWritePending || isPhoneWriteConfirming;

  const handleRegisterPhone = async () => {
    const hashed = hashPhoneE164(phoneInput);
    if (!hashed) {
      toast.error("Enter a valid phone in E.164 format (e.g. +2348012345678)");
      return;
    }

    if (!encryptionPassphrase.trim()) {
      toast.error("Enter an encryption passphrase to secure your phone on-chain");
      return;
    }

    try {
      const alreadyRegistered = await isPhoneHashRegistered(hashed.hash);
      if (alreadyRegistered) {
        const existingOwner = await resolveAddressByPhoneHash(hashed.hash);
        if (existingOwner && existingOwner.toLowerCase() !== address?.toLowerCase()) {
          toast.error(`This phone number is already mapped to ${existingOwner}`);
        } else {
          toast.error("This phone number is already mapped");
        }
        return;
      }

      const encryptedPayload = await encryptPhoneForOnchain(hashed.normalized, encryptionPassphrase);
      setPendingAction("register");
      toast.loading("Submitting phone mapping transaction...", { id: "register-phone" });
      await registerPhoneSecure(hashed.hash, encryptedPayload);
      toast.loading("Waiting for confirmation...", { id: "register-phone" });
    } catch (error: any) {
      toast.error(error?.message || "Failed to register phone", { id: "register-phone" });
      setPendingAction(null);
    }
  };

  const handleUnregisterPhone = async () => {
    try {
      setPendingAction("unregister");
      toast.loading("Submitting unmap transaction...", { id: "unregister-phone" });
      await unregisterPhone();
      toast.loading("Waiting for confirmation...", { id: "unregister-phone" });
    } catch (error: any) {
      toast.error(error?.message || "Failed to unregister phone", { id: "unregister-phone" });
      setPendingAction(null);
    }
  };

  const handleDecryptMappedPhone = async () => {
    if (!hasMappedPhoneHash) {
      toast.error("No mapped phone hash found on-chain");
      return;
    }

    if (!encryptedPhoneData || encryptedPhoneData === "0x") {
      toast.error("No encrypted phone payload found on-chain");
      return;
    }

    if (!decryptPassphrase.trim()) {
      toast.error("Enter your passphrase to decrypt");
      return;
    }

    const decrypted = await decryptPhoneFromOnchain(encryptedPhoneData, decryptPassphrase);
    if (!decrypted) {
      toast.error("Unable to decrypt. Check your passphrase.");
      return;
    }

    setMappedPhoneDisplay(decrypted);
    setPhoneInput(decrypted);
    toast.success("Mapped number loaded from contract");
  };

  useEffect(() => {
    if (!pendingAction || !isPhoneWriteConfirmed) return;

    if (pendingAction === "register") {
      toast.success("Phone mapped successfully!", { id: "register-phone" });
      setMappedPhoneDisplay(phoneInput);
      setDecryptPassphrase(encryptionPassphrase);
    } else {
      toast.success("Phone mapping removed", { id: "unregister-phone" });
      setMappedPhoneDisplay(null);
      setPhoneInput("");
      setDecryptPassphrase("");
    }

    setPendingAction(null);
    refetchMappedPhoneHash();
    refetchIsAddressRegistered();
    refetchEncryptedPhoneData();
  }, [
    pendingAction,
    phoneInput,
    encryptionPassphrase,
    isPhoneWriteConfirmed,
    refetchMappedPhoneHash,
    refetchIsAddressRegistered,
    refetchEncryptedPhoneData,
  ]);

  useEffect(() => {
    if (!phoneWriteError || !pendingAction) return;
    toast.error(phoneWriteError.message || "Phone mapping transaction failed");
    setPendingAction(null);
  }, [phoneWriteError, pendingAction]);

  useEffect(() => {
    if (!hasMappedPhoneHash) {
      setMappedPhoneDisplay(null);
      setPhoneInput("");
      return;
    }

    // Keep input clear until user decrypts from encrypted on-chain payload.
    setMappedPhoneDisplay(null);
    setPhoneInput("");
  }, [hasMappedPhoneHash]);

  if (!isConnected || !address) {
    return (
      <main className="flex-1">
        <div className="container mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-col items-center justify-center gap-4 py-20">
            <User className="h-12 w-12 text-foreground/40" />
            <h2 className="text-xl font-semibold text-white">
              Connect your wallet
            </h2>
            <p className="text-sm text-foreground/60">
              Connect your wallet to view your profile.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="container mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-foreground/60">
            Profile
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            Your Drip identity
          </h1>
          <p className="text-sm text-foreground/70">
            Manage your identity, view stats, and invite friends.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - 2/3 width */}
          <div className="space-y-6 lg:col-span-2">
            {/* Wallet Address Card */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5 text-green" />
                  Wallet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-white truncate">
                      {address}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyAddress}
                    className="h-8 w-8 shrink-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Identity Verification */}
            {isGoodDollarChain && (
              <>
                <IdentityStatus />
                <FaceVerification />
              </>
            )}

            {/* Phone Mapping */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Phone className="h-5 w-5 text-green" />
                  Phone Mapping
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground/70">
                  Register your phone hash on-chain so others can send you money using your phone number.
                </p>
                <Input
                  placeholder="+2348012345678"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  disabled={hasMappedPhoneHash || isPhoneBusy}
                />

                {!hasMappedPhoneHash && (
                  <Input
                    type="password"
                    placeholder="Set encryption passphrase"
                    value={encryptionPassphrase}
                    onChange={(e) => setEncryptionPassphrase(e.target.value)}
                    disabled={isPhoneBusy}
                  />
                )}

                {hasMappedPhoneHash && !mappedPhoneDisplay && (
                  <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-foreground/70">
                      Your phone is mapped and encrypted on-chain. Enter your passphrase to decrypt and display it.
                    </p>
                    <Input
                      type="password"
                      placeholder="Enter your passphrase"
                      value={decryptPassphrase}
                      onChange={(e) => setDecryptPassphrase(e.target.value)}
                      disabled={isPhoneBusy}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDecryptMappedPhone}
                      disabled={isPhoneBusy}
                    >
                      Decrypt From Contract
                    </Button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleRegisterPhone}
                    disabled={hasMappedPhoneHash || isPhoneBusy}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    {isPhoneWritePending || isPhoneWriteConfirming ? "Mapping..." : "Map Phone"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUnregisterPhone}
                    disabled={!hasMappedPhoneHash || isPhoneBusy}
                  >
                    <Unlink2 className="h-4 w-4 mr-2" />
                    Unmap
                  </Button>
                </div>
                <p className="text-xs text-foreground/60 font-mono break-all">
                  {hasMappedPhoneHash
                    ? mappedPhoneDisplay
                      ? `Mapped number: ${mappedPhoneDisplay}`
                      : "Phone is mapped on-chain (number hidden on this device)"
                    : "No phone mapped yet"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-6">
            {/* Invite Link Generator */}
            {/* {isGoodDollarChain && <InviteLinkGenerator />} */}

            {/* Settings (Placeholder) */}
            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-5 w-5" />
                  Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <Bell className="h-4 w-4" />
                  <span>Notifications</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Soon
                  </span>
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <Palette className="h-4 w-4" />
                  <span>Theme</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Dark
                  </span>
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <Shield className="h-4 w-4" />
                  <span>Privacy</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Soon
                  </span>
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left text-sm text-foreground/70 transition-colors hover:bg-white/10">
                  <HelpCircle className="h-4 w-4" />
                  <span>Help & FAQ</span>
                  <span className="ml-auto text-xs text-foreground/40">
                    Soon
                  </span>
                </button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
