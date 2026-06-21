"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
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
// WalletConnect Cloud project id — required for external wallets (MetaMask) on
// MOBILE, where wallets aren't injected into the browser and must be reached via
// WalletConnect deep-link. Without it, mobile MetaMask connects but fails at the
// SIWE signing step. Desktop (extension-injected) works either way.
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

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

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Email + Google + external wallet (MetaMask). WalletConnect is enabled
        // so external wallets also work on mobile (deep-link signing); injected
        // wallets continue to work on desktop.
        loginMethods: ["email", "google", "wallet"],
        walletConnectCloudProjectId: WALLETCONNECT_PROJECT_ID,
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          showWalletUIs: true,
        },
        defaultChain: celo,
        supportedChains: [celo, celoSepolia, celoAlfajores, liskMainnet],
        appearance: {
          theme: "dark",
          accentColor: "#10B981",
          // EVM-only; show detected/standard injected wallets plus the
          // WalletConnect option (the mobile fallback when nothing is injected).
          walletChainType: "ethereum-only",
          walletList: [
            "detected_wallets",
            "metamask",
            "coinbase_wallet",
            "rabby_wallet",
            "wallet_connect",
          ],
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
