"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Share2, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function InviteLinkGenerator() {
  const { address } = useAccount();
  const [inviterAddress, setInviterAddress] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string>("");

  const generateLink = () => {
    if (!address) {
      toast.error("Please connect your wallet first");
      return;
    }

    const inviter = inviterAddress.trim() || address;
    
    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(inviter)) {
      toast.error("Invalid inviter address");
      return;
    }

    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${baseUrl}/streams/create?inviter=${inviter}`;
    
    setGeneratedLink(link);
    
    // Store inviter in localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("drip_inviter", inviter);
    }
    
    toast.success("Invite link generated!");
  };

  const copyToClipboard = async () => {
    if (!generatedLink) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(generatedLink);
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.info("Link", { description: generatedLink, duration: 10000 });
      }
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("Failed to copy link");
    }
  };

  const shareLink = () => {
    if (!generatedLink) return;

    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({
        title: "Join me on Drip - Payment Streaming",
        text: "Create payment streams and earn rewards!",
        url: generatedLink,
      }).catch((err) => {
        console.error("Error sharing:", err);
        // Fallback to copy
        copyToClipboard();
      });
    } else {
      // Fallback to copy
      copyToClipboard();
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          Generate Invite Link
        </CardTitle>
        <CardDescription>
          Create a referral link to invite friends and earn rewards
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="inviter">Inviter Address (Optional)</Label>
          <Input
            id="inviter"
            placeholder={address || "0x..."}
            value={inviterAddress}
            onChange={(e) => setInviterAddress(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to use your own address as the inviter
          </p>
        </div>

        <Button onClick={generateLink} className="w-full" disabled={!address}>
          Generate Link
        </Button>

        {generatedLink && (
          <div className="space-y-2 pt-2 border-t">
            <Label>Your Invite Link</Label>
            <div className="flex gap-2">
              <Input
                value={generatedLink}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                onClick={copyToClipboard}
                variant="outline"
                size="icon"
                title="Copy link"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={shareLink}
                variant="outline"
                size="icon"
                title="Share link"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this link with friends. When they create a stream using this link, you'll both earn rewards!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

