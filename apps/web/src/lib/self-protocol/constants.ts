/**
 * Constants for Self Protocol identity verification integration
 */

/**
 * Default Self Protocol configuration
 */
export const DEFAULT_SELF_CONFIG = {
  appName: process.env.NEXT_PUBLIC_SELF_APP_NAME || "Drip - Programmable Payments",
  scope: process.env.NEXT_PUBLIC_SELF_SCOPE || "drip-payments",
  endpoint: process.env.NEXT_PUBLIC_SELF_ENDPOINT || "/api/self/verify",
  disclosures: {
    date_of_birth: true,
    minimumAge: 18,
  },
} as const;

/**
 * Self Protocol documentation URLs
 */
export const SELF_DOCS = {
  MAIN: "https://docs.self.xyz",
  QUICKSTART: "https://docs.self.xyz/use-self/quickstart",
  BACKEND: "https://docs.self.xyz/use-self/backend-verification",
  FRONTEND: "https://docs.self.xyz/use-self/frontend-integration",
} as const;

/**
 * QR code expiry time (in milliseconds)
 * Default: 5 minutes
 */
export const QR_CODE_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Verification session storage key
 */
export const SELF_VERIFICATION_SESSION_KEY = "self-verification-session";

/**
 * Get Self Protocol configuration
 */
export function getSelfConfig(userId: string): {
  appName: string;
  scope: string;
  endpoint: string;
  userId: string;
  disclosures: {
    date_of_birth: boolean;
    minimumAge: number;
  };
} {
  return {
    appName: process.env.NEXT_PUBLIC_SELF_APP_NAME || DEFAULT_SELF_CONFIG.appName,
    scope: process.env.NEXT_PUBLIC_SELF_SCOPE || DEFAULT_SELF_CONFIG.scope,
    endpoint: process.env.NEXT_PUBLIC_SELF_ENDPOINT || DEFAULT_SELF_CONFIG.endpoint,
    userId,
    disclosures: {
      date_of_birth: true,
      minimumAge: 18,
    },
  };
}

