"use client";

import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { useEffect, useState, useCallback } from "react";
import { IdentitySDK } from "@goodsdks/citizen-sdk";
import type { IdentityStatus, IdentityExpiry, FaceVerificationOptions } from "../types";
import { getGoodDollarEnvForChain } from "../constants";
import { isSupportedChain, getErrorMessage } from "../utils";

/**
 * Hook for interacting with Good Dollar Identity SDK
 * 
 * Provides:
 * - Identity verification status
 * - Face verification link generation
 * - Identity expiry information
 */
export function useIdentitySDK() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [identitySDK, setIdentitySDK] = useState<IdentitySDK | null>(null);
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>({
    isWhitelisted: false,
    root: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    isLoading: false,
    error: null,
  });
  const [identityExpiry, setIdentityExpiry] = useState<IdentityExpiry | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  // Initialize IdentitySDK when wallet is connected
  useEffect(() => {
    if (!isConnected || !address || !publicClient || !walletClient) {
      setIdentitySDK(null);
      return;
    }

    // Check if chain is supported
    if (!isSupportedChain(chainId)) {
      setIdentityStatus((prev) => ({
        ...prev,
        error: new Error(`Chain ${chainId} is not supported by Good Dollar`),
        isLoading: false,
      }));
      return;
    }

    const initializeSDK = async () => {
      setIsInitializing(true);
      try {
        const env = getGoodDollarEnvForChain(chainId);
        const sdk = await IdentitySDK.init({
          publicClient,
          walletClient,
          env,
        });
        setIdentitySDK(sdk);
        setIdentityStatus((prev) => ({
          ...prev,
          error: null,
        }));
      } catch (error) {
        console.error("Failed to initialize IdentitySDK:", error);
        setIdentityStatus((prev) => ({
          ...prev,
          error: error instanceof Error ? error : new Error("Failed to initialize Identity SDK"),
        }));
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSDK();
  }, [isConnected, address, publicClient, walletClient, chainId]);

  // Check whitelist status
  const checkWhitelistStatus = useCallback(async () => {
    if (!identitySDK || !address) {
      return;
    }

    setIdentityStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const result = await identitySDK.getWhitelistedRoot(address);
      setIdentityStatus({
        isWhitelisted: result.isWhitelisted,
        root: result.root,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error("Failed to check whitelist status:", error);
      setIdentityStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error : new Error("Failed to check whitelist status"),
      }));
    }
  }, [identitySDK, address]);

  // Check identity status when SDK is ready
  useEffect(() => {
    if (identitySDK && address && !isInitializing) {
      checkWhitelistStatus();
    }
  }, [identitySDK, address, isInitializing, checkWhitelistStatus]);

  // Get identity expiry information
  const getExpiryInfo = useCallback(async () => {
    if (!identitySDK || !address) {
      return null;
    }

    try {
      const expiryData = await identitySDK.getIdentityExpiryData(address);
      const expiry = identitySDK.calculateIdentityExpiry(
        expiryData.lastAuthenticated,
        expiryData.authPeriod
      );

      // Convert bigint timestamp to Date if needed
      const expiryTimestamp = typeof expiry === 'object' && expiry !== null && 'expiryTimestamp' in expiry
        ? (typeof expiry.expiryTimestamp === 'bigint' 
            ? new Date(Number(expiry.expiryTimestamp) * 1000)
            : expiry.expiryTimestamp as Date)
        : new Date(Number(expiryData.lastAuthenticated + expiryData.authPeriod) * 1000);
      
      const isExpired = typeof expiry === 'object' && expiry !== null && 'isExpired' in expiry
        ? expiry.isExpired as boolean
        : expiryTimestamp < new Date();

      setIdentityExpiry({
        lastAuthenticated: expiryData.lastAuthenticated,
        authPeriod: expiryData.authPeriod,
        expiryTimestamp,
        isExpired,
      });

      return expiry;
    } catch (error) {
      console.error("Failed to get identity expiry:", error);
      return null;
    }
  }, [identitySDK, address]);

  // Generate face verification link
  const generateFaceVerificationLink = useCallback(
    async (options?: FaceVerificationOptions): Promise<string | null> => {
      if (!identitySDK) {
        throw new Error("Identity SDK not initialized");
      }

      try {
        const callbackUrl = options?.callbackUrl || window.location.href;
        const link = await identitySDK.generateFVLink(
          options?.popupMode ?? false,
          callbackUrl,
          options?.chainId
        );
        return link;
      } catch (error) {
        console.error("Failed to generate face verification link:", error);
        throw error;
      }
    },
    [identitySDK]
  );

  return {
    // SDK instance
    identitySDK,
    isInitializing,

    // Identity status
    identityStatus,
    checkWhitelistStatus,

    // Identity expiry
    identityExpiry,
    getExpiryInfo,

    // Face verification
    generateFaceVerificationLink,

    // Helpers
    isReady: !!identitySDK && !isInitializing,
    error: identityStatus.error,
  };
}

