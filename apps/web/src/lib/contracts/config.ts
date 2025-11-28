import { celo } from "wagmi/chains";
import { defineChain } from "viem";

// Chain IDs - Supporting only Sepolia testnet and Mainnet
export const CELO_MAINNET_ID = 42220;
export const CELO_SEPOLIA_ID = 11142220;

// Define Celo Sepolia chain
export const celoSepolia = defineChain({
  id: CELO_SEPOLIA_ID,
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

/**
 * Contract addresses by network
 * 
 * Deployed addresses:
 * - Celo Sepolia Testnet (Proxy Deployment):
 *   - DripCore Proxy: 0xfAaB5005f7844eC5499cF258F52dE29EDc74aa31
 *   - DripCore Implementation: 0xe4789E09696De271E9192e88883722C38326D741
 *   - Proxy Admin: 0xb94d80dB6a120D6c22f199c5Ff9B4CF9C8F4EE25
 *   - SubscriptionManager: 0xb8eCfcC00e1d63525b81cF2bC17125f56952D384
 * - Celo Mainnet:
 *   - DripCore: 0x5530975fDe062FE6706298fF3945E3d1a17A310a
 *   - SubscriptionManager: 0xBE3e232657233224F14b7b2a5625f69aF8F95054
 */
export const CONTRACT_ADDRESSES = {
  [CELO_MAINNET_ID]: {
    DripCore: "0x5530975fDe062FE6706298fF3945E3d1a17A310a" as `0x${string}`,
    SubscriptionManager: "0xBE3e232657233224F14b7b2a5625f69aF8F95054" as `0x${string}`,
  },
  [CELO_SEPOLIA_ID]: {
    DripCore: "0xfAaB5005f7844eC5499cF258F52dE29EDc74aa31" as `0x${string}`,
    SubscriptionManager: "0xb8eCfcC00e1d63525b81cF2bC17125f56952D384" as `0x${string}`,
  },
} as const;

/**
 * Get contract address for current network
 */
export function getContractAddress(
  chainId: number,
  contractName: "DripCore" | "SubscriptionManager"
): `0x${string}` | null {
  const addresses = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  if (!addresses) return null;
  
  const address = addresses[contractName];
  // Check if address is zero (not deployed)
  if (address === "0x0000000000000000000000000000000000000000") return null;
  
  return address;
}

