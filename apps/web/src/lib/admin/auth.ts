/**
 * Admin authentication utilities
 * Whitelist admin addresses for accessing protected routes
 */

// Admin addresses (whitelisted)
const ADMIN_ADDRESSES = [
  "0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec", // Primary admin
].map(addr => addr.toLowerCase());

/**
 * Check if an address is an admin
 * @param address - Wallet address to check
 * @returns True if address is an admin
 */
export function isAdmin(address: string | undefined): boolean {
  if (!address) return false;
  return ADMIN_ADDRESSES.includes(address.toLowerCase());
}

/**
 * Get list of admin addresses
 * @returns Array of admin addresses
 */
export function getAdminAddresses(): string[] {
  return [...ADMIN_ADDRESSES];
}

/**
 * Hook for checking admin status in React components
 */
import { useAccount } from "wagmi";

export function useIsAdmin(): boolean {
  const { address } = useAccount();
  return isAdmin(address);
}
