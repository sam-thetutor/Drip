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
 * - Celo Sepolia Testnet:
 *   - DripCore: 0xA14adF0D5dc52bbCf32d8a571986F13637dbDB17
 *   - SubscriptionManager: 0x51a7F75Af71808D34A7D18FD2fC36BEea7b47Be8
 * - Celo Mainnet:
 *   - DripCore: 0x7584c4366C8b71A1c45342e0D2CEd19e1f1a668A
 *   - SubscriptionManager: 0x1001E2E27a29F7003A30c408716A89B6e3F49e15
 */
export const CONTRACT_ADDRESSES = {
  [CELO_MAINNET_ID]: {
    DripCore: "0x7584c4366C8b71A1c45342e0D2CEd19e1f1a668A" as `0x${string}`,
    SubscriptionManager: "0x1001E2E27a29F7003A30c408716A89B6e3F49e15" as `0x${string}`,
  },
  [CELO_SEPOLIA_ID]: {
    DripCore: "0xA14adF0D5dc52bbCf32d8a571986F13637dbDB17" as `0x${string}`,
    SubscriptionManager: "0x51a7F75Af71808D34A7D18FD2fC36BEea7b47Be8" as `0x${string}`,
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

