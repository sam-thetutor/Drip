"use client";

import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { useEffect, useState, useCallback } from "react";
import { ClaimSDK } from "@goodsdks/citizen-sdk";
import { useIdentitySDK } from "./useIdentitySDK";
import type {
  ClaimEntitlement,
  WalletClaimStatus,
  ClaimState,
  ClaimTransactionState,
} from "../types";
import { isSupportedChain } from "../utils";
import { createClaimEntitlement } from "../utils";

/**
 * Hook for interacting with Good Dollar Claim SDK
 * 
 * Provides:
 * - Claim entitlement checking
 * - Wallet claim status
 * - Claim transaction execution
 * - Next claim time tracking
 */
export function useClaimSDK() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { identitySDK, identityStatus, isReady: isIdentityReady } = useIdentitySDK();

  const [claimSDK, setClaimSDK] = useState<ClaimSDK | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [entitlement, setEntitlement] = useState<ClaimEntitlement | null>(null);
  const [walletClaimStatus, setWalletClaimStatus] = useState<WalletClaimStatus | null>(null);
  const [nextClaimTime, setNextClaimTime] = useState<Date | null>(null);
  const [claimState, setClaimState] = useState<ClaimState>({
    state: "idle",
    error: null,
    transactionHash: null,
  });

  // Initialize ClaimSDK when IdentitySDK is ready
  useEffect(() => {
    if (!isConnected || !address || !publicClient || !walletClient || !identitySDK) {
      setClaimSDK(null);
      return;
    }

    // Check if chain is supported
    if (!isSupportedChain(chainId)) {
      return;
    }

    // Only initialize if identity is verified
    if (!identityStatus.isWhitelisted) {
      setClaimSDK(null);
      return;
    }

    const initializeSDK = async () => {
      setIsInitializing(true);
      try {
        const sdk = await ClaimSDK.init({
          account: address,
          publicClient,
          walletClient,
          identitySDK,
        });
        setClaimSDK(sdk);
        setClaimState((prev) => ({
          ...prev,
          error: null,
        }));
      } catch (error) {
        console.error("Failed to initialize ClaimSDK:", error);
        setClaimState({
          state: "error",
          error: error instanceof Error ? error : new Error("Failed to initialize Claim SDK"),
          transactionHash: null,
        });
      } finally {
        setIsInitializing(false);
      }
    };

    if (isIdentityReady && identityStatus.isWhitelisted) {
      initializeSDK();
    }
  }, [
    isConnected,
    address,
    publicClient,
    walletClient,
    identitySDK,
    chainId,
    identityStatus.isWhitelisted,
    isIdentityReady,
  ]);

  // Check entitlement
  const checkEntitlement = useCallback(async () => {
    if (!claimSDK) {
      return null;
    }

    setClaimState((prev) => ({ ...prev, state: "checking" }));

    try {
      const result = await claimSDK.checkEntitlement();
      
      // Handle undefined or null entitlement
      const entitlementAmount = result?.entitlement ?? 0n;
      const altClaimAvailable = result?.altClaimAvailable ?? false;
      
      const entitlementData = createClaimEntitlement(
        entitlementAmount,
        altClaimAvailable
      );
      setEntitlement(entitlementData);
      setClaimState((prev) => ({ ...prev, state: "idle", error: null }));
      return entitlementData;
    } catch (error) {
      console.error("Failed to check entitlement:", error);
      setClaimState({
        state: "error",
        error: error instanceof Error ? error : new Error("Failed to check entitlement"),
        transactionHash: null,
      });
      return null;
    }
  }, [claimSDK]);

  // Get wallet claim status
  const getWalletClaimStatus = useCallback(async () => {
    if (!claimSDK) {
      return null;
    }

    try {
      const status = await claimSDK.getWalletClaimStatus();
      setWalletClaimStatus(status);
      return status;
    } catch (error) {
      console.error("Failed to get wallet claim status:", error);
      return null;
    }
  }, [claimSDK]);

  // Get next claim time
  const getNextClaimTime = useCallback(async () => {
    if (!claimSDK) {
      return null;
    }

    try {
      const time = await claimSDK.nextClaimTime();
      setNextClaimTime(time);
      return time;
    } catch (error) {
      console.error("Failed to get next claim time:", error);
      return null;
    }
  }, [claimSDK]);

  // Execute claim transaction
  const claim = useCallback(
    async (onProgress?: (message: string) => void) => {
      if (!claimSDK) {
        throw new Error("Claim SDK not initialized");
      }

      setClaimState((prev) => ({
        ...prev,
        state: "claiming",
        error: null,
        transactionHash: null,
      }));

      try {
        onProgress?.("Preparing claim transaction...");

        const receipt = await claimSDK.claim((message) => {
          onProgress?.(message);
        });

        setClaimState({
          state: "success",
          error: null,
          transactionHash: receipt.transactionHash || null,
        });

        // Refresh entitlement and status after successful claim
        await Promise.all([checkEntitlement(), getWalletClaimStatus(), getNextClaimTime()]);

        return receipt;
      } catch (error) {
        console.error("Claim transaction failed:", error);
        setClaimState({
          state: "error",
          error: error instanceof Error ? error : new Error("Claim transaction failed"),
          transactionHash: null,
        });
        throw error;
      }
    },
    [claimSDK, checkEntitlement, getWalletClaimStatus, getNextClaimTime]
  );

  // Auto-check entitlement when SDK is ready
  useEffect(() => {
    if (claimSDK && !isInitializing) {
      checkEntitlement();
      getWalletClaimStatus();
      getNextClaimTime();
    }
  }, [claimSDK, isInitializing, checkEntitlement, getWalletClaimStatus, getNextClaimTime]);

  return {
    // SDK instance
    claimSDK,
    isInitializing,

    // Entitlement
    entitlement,
    checkEntitlement,

    // Wallet claim status
    walletClaimStatus,
    getWalletClaimStatus,

    // Next claim time
    nextClaimTime,
    getNextClaimTime,

    // Claim transaction
    claim,
    claimState,

    // Helpers
    isReady: !!claimSDK && !isInitializing,
    canClaim: entitlement?.canClaim ?? false,
    isWhitelisted: identityStatus.isWhitelisted,
  };
}

