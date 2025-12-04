/**
 * Constants for Good Dollar UBI integration
 */

import type { GoodDollarEnv } from "./types";

/**
 * Default Good Dollar environment
 * Can be overridden via NEXT_PUBLIC_GOODDOLLAR_ENV environment variable
 */
export const DEFAULT_GOODDOLLAR_ENV: GoodDollarEnv =
  (process.env.NEXT_PUBLIC_GOODDOLLAR_ENV as GoodDollarEnv) || "staging";

/**
 * Supported chain IDs for Good Dollar
 * Celo Mainnet: 42220
 * Celo Sepolia: 11142220 (testnet)
 */
export const SUPPORTED_CHAIN_IDS = {
  CELO_MAINNET: 42220,
  CELO_SEPOLIA: 11142220,
} as const;

/**
 * Get the appropriate Good Dollar environment based on chain ID
 */
export function getGoodDollarEnvForChain(chainId: number): GoodDollarEnv {
  // If explicitly set, use that
  if (process.env.NEXT_PUBLIC_GOODDOLLAR_ENV) {
    return process.env.NEXT_PUBLIC_GOODDOLLAR_ENV as GoodDollarEnv;
  }

  // Otherwise, determine based on chain ID
  if (chainId === SUPPORTED_CHAIN_IDS.CELO_MAINNET) {
    return "production";
  } else if (chainId === SUPPORTED_CHAIN_IDS.CELO_SEPOLIA) {
    return "staging";
  }

  // Default to staging for safety
  return "staging";
}

/**
 * Good Dollar documentation URLs
 */
export const GOODDOLLAR_DOCS = {
  MAIN: "https://docs.gooddollar.org",
  UBI: "https://docs.gooddollar.org/frequently-asked-questions/about-gooddollar",
  IDENTITY: "https://docs.gooddollar.org/for-developers/apis-and-sdks/sybil-resistance/identity-ethers-v5-react",
  CLAIMS: "https://docs.gooddollar.org/for-developers/apis-and-sdks/ubi/claim-ubi-viem-wagmi",
} as const;

