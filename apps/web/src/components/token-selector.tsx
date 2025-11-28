"use client";

import { useChainId } from "wagmi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CELO_MAINNET_ID, CELO_SEPOLIA_ID } from "@/lib/contracts/config";

export interface Token {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  name: string;
}

// Token addresses by network - Supporting only Sepolia testnet and Mainnet
// Source: Official Celo token registry
export const TOKENS_BY_NETWORK: Record<number, Token[]> = {
  [CELO_MAINNET_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0x765DE816845861e75A25fCA122bb6898B8B1282a", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6, name: "Tether USD" },
  ],
  [CELO_SEPOLIA_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0xd077A400968890Eacc75cdc901F0356c943e4fDb", decimals: 6, name: "Tether USD" },
  ],
};

interface TokenSelectorProps {
  value?: `0x${string}`;
  onValueChange: (value: `0x${string}`) => void;
  disabled?: boolean;
}

export function TokenSelector({ value, onValueChange, disabled }: TokenSelectorProps) {
  const chainId = useChainId();
  const tokens = TOKENS_BY_NETWORK[chainId] || TOKENS_BY_NETWORK[CELO_SEPOLIA_ID];

  const selectedToken = tokens.find((t) => t.address === value);

  return (
    <Select
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select token">
          {selectedToken ? `${selectedToken.symbol} (${selectedToken.name})` : "Select token"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {tokens.map((token) => (
          <SelectItem key={token.address} value={token.address}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{token.symbol}</span>
              <span className="text-muted-foreground text-sm">({token.name})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function getTokenByAddress(address: `0x${string}`, chainId: number): Token | undefined {
  const tokens = TOKENS_BY_NETWORK[chainId] || TOKENS_BY_NETWORK[CELO_SEPOLIA_ID];
  return tokens.find((t) => t.address === address);
}

