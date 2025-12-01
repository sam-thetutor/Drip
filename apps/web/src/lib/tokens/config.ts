import { CELO_MAINNET_ID, CELO_SEPOLIA_ID, CELO_ALFAJORES_ID } from "@/lib/contracts/config";

/**
 * Token interface for token configuration
 */
export interface Token {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  name: string;
}

/**
 * Centralized token configuration for all Celo networks
 * 
 * Token addresses verified from official Celo documentation:
 * - Mainnet: https://docs.celo.org/developer-guide/celo-for-eth-devs
 * - Sepolia: Celo Sepolia testnet
 * - Alfajores: Celo Alfajores testnet (sunset after Sep 2025, but still supported)
 */
export const TOKENS_BY_NETWORK: Record<number, Token[]> = {
  // Celo Mainnet (chainId: 42220)
  [CELO_MAINNET_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0x765DE816845861e75A25fCA122bb6898B8B1282a", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6, name: "Tether USD" },
  ],
  // Celo Sepolia Testnet (chainId: 11142220)
  [CELO_SEPOLIA_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0xd077A400968890Eacc75cdc901F0356c943e4fDb", decimals: 6, name: "Tether USD" },
  ],
  // Celo Alfajores Testnet (chainId: 44787)
  // Note: Alfajores is being sunset after September 2025, migrate to Sepolia
  [CELO_ALFAJORES_ID]: [
    { symbol: "CELO", address: "0x0000000000000000000000000000000000000000", decimals: 18, name: "Celo" },
    { symbol: "cUSD", address: "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1", decimals: 18, name: "Celo Dollar" },
    { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6, name: "USD Coin" },
    { symbol: "USDT", address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6, name: "Tether USD" },
  ],
};

/**
 * Get token by address for a specific network
 */
export function getTokenByAddress(
  address: `0x${string}`,
  chainId: number
): Token | undefined {
  const tokens = TOKENS_BY_NETWORK[chainId] || TOKENS_BY_NETWORK[CELO_SEPOLIA_ID];
  return tokens.find(
    (t) => t.address.toLowerCase() === address.toLowerCase()
  );
}

/**
 * Get all tokens for a specific network
 */
export function getTokensForNetwork(chainId: number): Token[] {
  return TOKENS_BY_NETWORK[chainId] || TOKENS_BY_NETWORK[CELO_SEPOLIA_ID];
}

/**
 * Get token address by symbol for a specific network
 */
export function getTokenAddressBySymbol(
  symbol: string,
  chainId: number
): `0x${string}` | undefined {
  const tokens = TOKENS_BY_NETWORK[chainId] || TOKENS_BY_NETWORK[CELO_SEPOLIA_ID];
  const token = tokens.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
  return token?.address;
}

