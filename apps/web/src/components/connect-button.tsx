"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";

export function ConnectButton() {
  const { ready, authenticated, login } = usePrivy();

  // Placeholder while Privy boots, to avoid layout shift.
  if (!ready) {
    return (
      <Button disabled className="h-10 opacity-50 cursor-not-allowed">
        Connect Wallet
      </Button>
    );
  }

  // Hide when logged in (WalletButton shows instead).
  if (authenticated) {
    return null;
  }

  return (
    <Button
      onClick={login}
      className="h-10 bg-green hover:bg-green/90 text-white font-medium"
    >
      Connect Wallet
    </Button>
  );
}
