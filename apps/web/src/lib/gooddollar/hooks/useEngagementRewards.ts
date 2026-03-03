"use client";

import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { useEffect, useState, useCallback } from "react";
import { useEngagementRewards as useEngagementRewardsSDK, REWARDS_CONTRACT, DEV_REWARDS_CONTRACT } from "@goodsdks/engagement-sdk";
import { getEngagementRewardsAddress } from "@/lib/contracts/config";
import { isSupportedChain } from "../utils";

/**
 * Hook for interacting with Good Dollar Engagement Rewards SDK
 * 
 * Provides:
 * - SDK initialization
 * - User registration status checking
 * - Signature generation for first-time users
 * - Current block number
 * - Eligibility checking
 */
export function useEngagementRewards() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Get engagement rewards contract address
  const rewardsContract = getEngagementRewardsAddress(chainId, "DEV");
  
  // Initialize SDK
  const engagementRewards = useEngagementRewardsSDK(rewardsContract || DEV_REWARDS_CONTRACT);

  const [isInitializing, setIsInitializing] = useState(false);
  const [isUserRegistered, setIsUserRegistered] = useState<boolean | null>(null);
  const [canClaim, setCanClaim] = useState<boolean | null>(null);
  const [currentBlock, setCurrentBlock] = useState<bigint | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Get DripCore contract address
  const getDripCoreAddress = useCallback(() => {
    const { getContractAddress } = require("@/lib/contracts/config");
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  // Check if user is registered
  const checkUserRegistration = useCallback(async () => {
    if (!engagementRewards || !address || !isSupportedChain(chainId)) {
      return;
    }

    try {
      const appAddress = getDripCoreAddress();
      if (!appAddress) return;

      const registered = await (engagementRewards as any).isUserRegistered(appAddress, address);
      setIsUserRegistered(registered);
      return registered;
    } catch (err) {
      console.error("Error checking user registration:", err);
      setError(err instanceof Error ? err : new Error("Failed to check registration"));
      return null;
    }
  }, [engagementRewards, address, chainId, getDripCoreAddress]);

  // Check if user can claim
  const checkCanClaim = useCallback(async () => {
    if (!engagementRewards || !address || !isSupportedChain(chainId)) {
      return;
    }

    try {
      const appAddress = getDripCoreAddress();
      if (!appAddress) return;

      const eligible = await engagementRewards.canClaim(appAddress, address).catch(() => false);
      setCanClaim(eligible);
      return eligible;
    } catch (err) {
      console.error("Error checking claim eligibility:", err);
      setError(err instanceof Error ? err : new Error("Failed to check eligibility"));
      return false;
    }
  }, [engagementRewards, address, chainId, getDripCoreAddress]);

  // Get current block number
  const getCurrentBlockNumber = useCallback(async (): Promise<bigint | null> => {
    if (!engagementRewards) {
      return null;
    }

    try {
      const blockNumber = await engagementRewards.getCurrentBlockNumber();
      setCurrentBlock(blockNumber);
      return blockNumber;
    } catch (err) {
      console.error("Error getting current block:", err);
      setError(err instanceof Error ? err : new Error("Failed to get block number"));
      return null;
    }
  }, [engagementRewards]);

  // Generate signature for first-time registration
  const signClaim = useCallback(async (
    inviter: `0x${string}` | null = null,
    validUntilBlock?: bigint
  ): Promise<`0x${string}`> => {
    if (!engagementRewards || !address || !walletClient) {
      throw new Error("Engagement rewards SDK not initialized or wallet not connected");
    }

    try {
      const appAddress = getDripCoreAddress();
      if (!appAddress) {
        throw new Error("DripCore contract not found on this network");
      }

      // Get current block if not provided
      let validUntil = validUntilBlock;
      if (!validUntil) {
        const currentBlock = await getCurrentBlockNumber();
        if (!currentBlock) {
          throw new Error("Failed to get current block number");
        }
        validUntil = currentBlock + 600n; // Valid for 600 blocks (~2 hours)
      }

      const inviterAddress = inviter || "0x0000000000000000000000000000000000000000";
      const signature = await engagementRewards.signClaim(
        appAddress,
        inviterAddress,
        validUntil
      );

      return signature as `0x${string}`;
    } catch (err) {
      console.error("Error signing claim:", err);
      const error = err instanceof Error ? err : new Error("Failed to generate signature");
      setError(error);
      throw error;
    }
  }, [engagementRewards, address, walletClient, chainId, getDripCoreAddress, getCurrentBlockNumber]);

  // Initialize and check status when SDK is ready
  useEffect(() => {
    if (!engagementRewards || !isConnected || !address || !isSupportedChain(chainId)) {
      setIsUserRegistered(null);
      setCanClaim(null);
      setCurrentBlock(null);
      return;
    }

    const initialize = async () => {
      setIsInitializing(true);
      setError(null);

      try {
        // Get current block
        await getCurrentBlockNumber();

        // Check registration status
        await checkUserRegistration();

        // Check eligibility
        await checkCanClaim();
      } catch (err) {
        console.error("Error initializing engagement rewards:", err);
        setError(err instanceof Error ? err : new Error("Failed to initialize"));
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();
  }, [engagementRewards, isConnected, address, chainId, getCurrentBlockNumber, checkUserRegistration, checkCanClaim]);

  return {
    // SDK instance
    engagementRewards,
    isInitializing,
    isReady: !!engagementRewards && !isInitializing,

    // Status
    isUserRegistered,
    canClaim,
    currentBlock,

    // Functions
    checkUserRegistration,
    checkCanClaim,
    getCurrentBlockNumber,
    signClaim,

    // Error
    error,
  };
}

