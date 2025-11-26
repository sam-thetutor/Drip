"use client";

import { useAccount, useBalance, useChainId } from "wagmi";
import { celo, celoAlfajores } from "wagmi/chains";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Chain IDs
const CELO_MAINNET_ID = 42220;
const CELO_ALFAJORES_ID = 44787;
const CELO_SEPOLIA_ID = 11142220;

// Token addresses by network
const TOKEN_ADDRESSES = {
  // Celo Mainnet (chainId: 42220)
  [CELO_MAINNET_ID]: {
    cUSD: "0x765de816845861e75a25fca122bb6898b8b1282a" as `0x${string}`,
    USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`,
    USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`,
  },
  // Celo Alfajores Testnet (chainId: 44787)
  [CELO_ALFAJORES_ID]: {
    cUSD: "0x765de816845861e75a25fca122bb6898b8b1282a" as `0x${string}`,
    USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`,
    USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`,
  },
  // Celo Sepolia Testnet (chainId: 11142220)
  [CELO_SEPOLIA_ID]: {
    cUSD: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" as `0x${string}`,
    USDC: "0x01C5C0122039549AD1493B8220cABEdD739BC44E" as `0x${string}`,
    // USDT may not be available on Sepolia, using placeholder
    USDT: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  },
};

function BalanceDisplay({ address, token, symbol }: { address: `0x${string}`, token?: `0x${string}`, symbol: string }) {
  const { data, isLoading } = useBalance({
    address,
    token,
  });

  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{symbol}</span>
      <span className="font-medium">
        {isLoading ? "Loading..." : `${parseFloat(data?.formatted || '0').toFixed(4)}`}
      </span>
    </div>
  );
}

export function UserBalance() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected || !address) {
    return null;
  }

  // Get token addresses for current network
  const tokens = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];
  
  // If network not supported, use mainnet addresses as fallback
  const cUSD_ADDRESS = tokens?.cUSD || TOKEN_ADDRESSES[CELO_MAINNET_ID].cUSD;
  const USDC_ADDRESS = tokens?.USDC || TOKEN_ADDRESSES[CELO_MAINNET_ID].USDC;
  const USDT_ADDRESS = tokens?.USDT || TOKEN_ADDRESSES[CELO_MAINNET_ID].USDT;

  // Check if USDT is available on this network (not zero address)
  const isUSDTAvailable = USDT_ADDRESS !== "0x0000000000000000000000000000000000000000";

  return (
    <Card className="glass-card w-full max-w-md mx-auto mb-8">
      <CardHeader>
        <CardTitle className="text-lg font-medium">Connected Wallet</CardTitle>
        <p className="text-sm text-muted-foreground truncate pt-1">{address}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 pt-2 border-t">
          <BalanceDisplay address={address} symbol="CELO" token={undefined} />
          <BalanceDisplay address={address} token={cUSD_ADDRESS} symbol="cUSD" />
          <BalanceDisplay address={address} token={USDC_ADDRESS} symbol="USDC" />
          {isUSDTAvailable && (
            <BalanceDisplay address={address} token={USDT_ADDRESS} symbol="USDT" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
