import { keccak256, toBytes } from "viem";
import { normalizePhoneE164 } from "./normalize";

export interface PhoneHashResult {
  normalized: string;
  hash: `0x${string}`;
}

/**
 * Normalize and hash a phone number for on-chain mapping.
 */
export function hashPhoneE164(input: string): PhoneHashResult | null {
  const normalized = normalizePhoneE164(input);
  if (!normalized) return null;

  const hash = keccak256(toBytes(normalized));
  return {
    normalized,
    hash,
  };
}
