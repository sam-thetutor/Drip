"use client";

import { useEffect } from "react";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, useAccount, useDisconnect } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { defineChain } from "viem";
import { liskMainnet } from "@/lib/contracts/config";

// Define Celo Sepolia manually if not exported from wagmi/chains
const celoSepolia = defineChain({
  id: 11142220,
  name: "Celo Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "CELO",
    symbol: "CELO",
  },
  rpcUrls: {
    default: {
      http: ["https://forno.celo-sepolia.celo-testnet.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Celo Sepolia Explorer",
      url: "https://celo-sepolia.blockscout.com",
    },
  },
  testnet: true,
});

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

// IMPORTANT: createConfig + WagmiProvider come from @privy-io/wagmi (NOT wagmi),
// so Privy drives wagmi's connector state and keeps the embedded/external wallet
// in sync with every existing wagmi hook.
const wagmiConfig = createConfig({
  chains: [celo, celoSepolia, celoAlfajores, liskMainnet],
  transports: {
    [celo.id]: http(),
    [celoSepolia.id]: http(),
    [celoAlfajores.id]: http(),
    [liskMainnet.id]: http(),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
    },
  },
});

/**
 * Drops any wagmi connection that isn't backed by a Privy session. This clears
 * stale wallet connections (e.g. a MetaMask connection persisted in
 * localStorage from before the Privy migration) that wagmi auto-reconnects on
 * load, so the UI never shows "connected" while Privy is logged out.
 */
function WalletReconciler() {
  const { ready, authenticated } = usePrivy();
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    if (ready && !authenticated && isConnected) {
      disconnect();
    }
  }, [ready, authenticated, isConnected, disconnect]);

  return null;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Email + Google + external wallet (MetaMask). Kept to injected EVM
        // wallets only (no WalletConnect / Coinbase / Solana adapters) to avoid
        // bundling thousands of extra modules.
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          showWalletUIs: true,
        },
        defaultChain: celo,
        supportedChains: [celo, celoSepolia, celoAlfajores, liskMainnet],
        appearance: {
          theme: "dark",
          accentColor: "#10B981",
          // EVM-only; show all detected/standard injected wallets.
          walletChainType: "ethereum-only",
          walletList: [
            "detected_wallets",
            "metamask",
            "coinbase_wallet",
            "rabby_wallet",
          ],
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <WalletReconciler />
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
