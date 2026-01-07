"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UserPlus, Check } from "lucide-react";
import { toast } from "sonner";

export function SetInviter() {
  const { address } = useAccount();
  const [inviterAddress, setInviterAddress] = useState<string>("");
  const [saved, setSaved] = useState(false);

  // Load existing inviter from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("drip_inviter");
      if (stored) {
        setInviterAddress(stored);
      }
    }
  }, []);

  const handleSave = () => {
    const inviter = inviterAddress.trim();
    
    // Validate address format
    if (inviter && !/^0x[a-fA-F0-9]{40}$/.test(inviter)) {
      toast.error("Invalid inviter address format");
      return;
    }

    if (typeof window !== "undefined") {
      if (inviter) {
        localStorage.setItem("drip_inviter", inviter);
        toast.success("Inviter address saved!");
      } else {
        localStorage.removeItem("drip_inviter");
        toast.success("Inviter address cleared!");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const currentInviter = typeof window !== "undefined" 
    ? localStorage.getItem("drip_inviter") 
    : null;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Set Inviter Address
        </CardTitle>
        <CardDescription>
          Set the address of the person who invited you to earn referral rewards
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="inviter">Inviter Address</Label>
          <Input
            id="inviter"
            placeholder="0x..."
            value={inviterAddress}
            onChange={(e) => setInviterAddress(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to remove the inviter. This will be used when you create streams or withdraw.
          </p>
        </div>

        {currentInviter && (
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Current Inviter:</p>
            <p className="text-sm font-mono">{currentInviter}</p>
          </div>
        )}

        <Button 
          onClick={handleSave} 
          className="w-full"
          disabled={saved}
        >
          {saved ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved!
            </>
          ) : (
            "Save Inviter"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

