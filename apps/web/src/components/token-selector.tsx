"use client";

import { useChainId } from "wagmi";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CELO_MAINNET_ID, CELO_ALFAJORES_ID, CELO_SEPOLIA_ID } from "@/lib/contracts/config";

export interface Token {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  name: string;
}

// Token addresses by network
const TOKENS_BY_NETWORK: Record<number, Token[]> = {
  [CELO_MAINNET_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0x765de816845861e75a25fca122bb6898b8b1282a", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6, name: "Tether" },
  ],
  [CELO_ALFAJORES_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0x765de816845861e75a25fca122bb6898b8b1282a", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6, name: "Tether" },
  ],
  [CELO_SEPOLIA_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E", decimals: 6, name: "USD Coin" },
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

