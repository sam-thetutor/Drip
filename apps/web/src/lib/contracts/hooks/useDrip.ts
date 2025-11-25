"use client";

import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { getContractAddress, CONTRACT_ADDRESSES, CELO_SEPOLIA_ID } from "../config";
import { DRIP_CORE_ABI } from "../abis";
import { parseEther, parseUnits, formatEther, formatUnits } from "viem";
import { useMemo } from "react";
import { getTokenByAddress } from "@/components/token-selector";

/**
 * Hook for interacting with DripCore contract
 */
export function useDrip() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const contractAddress = useMemo(() => {
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  /**
   * Create a new payment stream
   * @param recipients Array of recipient addresses
   * @param token Token address (address(0) for native CELO)
   * @param amountsPerPeriod Array of amounts per period for each recipient (human-readable)
   * @param periodSeconds Duration of each period in seconds
   * @param deposit Total deposit amount (human-readable)
   * @param title Optional title
   * @param description Optional description
   */
  const createStream = async (
    recipients: `0x${string}`[],
    token: `0x${string}`, // Token address (address(0) for native CELO)
    amountsPerPeriod: string[], // Human-readable amounts (e.g., "100", "50")
    periodSeconds: number, // Period duration in seconds
    deposit: string, // Total deposit (human-readable)
    title: string = "",
    description: string = ""
  ) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    // Convert amounts to wei (assuming 18 decimals for now - should be dynamic based on token)
    const amountsInWei = amountsPerPeriod.map((amount) => parseEther(amount));
    const depositInWei = parseEther(deposit);

    // For native CELO, send the deposit as value
    const value = token === "0x0000000000000000000000000000000000000000" ? depositInWei : 0n;

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "createStream",
      args: [recipients, token, amountsInWei, BigInt(periodSeconds), depositInWei, title, description],
      value,
    });
  };

  /**
   * Pause a stream
   */
  const pauseStream = async (streamId: bigint) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "pauseStream",
      args: [streamId],
    });
  };

  /**
   * Resume a paused stream
   */
  const resumeStream = async (streamId: bigint) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "resumeStream",
      args: [streamId],
    });
  };

  /**
   * Cancel a stream
   */
  const cancelStream = async (streamId: bigint) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "cancelStream",
      args: [streamId],
    });
  };

  /**
   * Withdraw from a stream (as recipient)
   * @param streamId Stream ID
   * @param recipient Recipient address
   * @param amount Amount to withdraw (0 for maximum available)
   */
  const withdrawFromStream = async (streamId: bigint, recipient: `0x${string}`, amount: bigint = 0n) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "withdrawFromStream",
      args: [streamId, recipient, amount],
    });
  };

  /**
   * Add a recipient to an existing stream
   * @param streamId Stream ID
   * @param recipient New recipient address
   * @param amountPerPeriod Amount per period (human-readable)
   * @param additionalDeposit Additional deposit required (human-readable)
   * @param token Token address (to determine if native payment needed)
   */
  const addRecipient = async (
    streamId: bigint,
    recipient: `0x${string}`,
    amountPerPeriod: string,
    additionalDeposit: string,
    token: `0x${string}`
  ) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    // Get token decimals from token info
    const tokenInfo = getTokenByAddress(token, chainId);
    const decimals = tokenInfo?.decimals || 18;

    const amountPerPeriodInWei = parseUnits(amountPerPeriod, decimals);
    const depositInWei = parseUnits(additionalDeposit, decimals);

    const value = token === "0x0000000000000000000000000000000000000000" ? depositInWei : 0n;

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "addRecipient",
      args: [streamId, recipient, amountPerPeriodInWei, depositInWei],
      value,
    });
  };

  /**
   * Remove a recipient from an existing stream
   */
  const removeRecipient = async (
    streamId: bigint,
    recipient: `0x${string}`
  ) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "removeRecipient",
      args: [streamId, recipient],
    });
  };

  /**
   * Update a recipient's rate in an existing stream
   * @param streamId Stream ID
   * @param recipient Recipient address
   * @param newAmountPerPeriod New amount per period (human-readable)
   * @param additionalDeposit Additional deposit if increasing rate (human-readable)
   * @param token Token address (to determine if native payment needed)
   */
  const updateRecipientRate = async (
    streamId: bigint,
    recipient: `0x${string}`,
    newAmountPerPeriod: string,
    additionalDeposit: string,
    token: `0x${string}`
  ) => {
    if (!contractAddress) {
      throw new Error("DripCore contract not deployed on this network");
    }

    const amountPerPeriodInWei = parseEther(newAmountPerPeriod);
    const depositInWei = parseEther(additionalDeposit);

    const value = token === "0x0000000000000000000000000000000000000000" ? depositInWei : 0n;

    return writeContract({
      address: contractAddress,
      abi: DRIP_CORE_ABI,
      functionName: "updateRecipientRate",
      args: [streamId, recipient, amountPerPeriodInWei, depositInWei],
      value,
    });
  };

  return {
    contractAddress,
    isConnected,
    createStream,
    pauseStream,
    resumeStream,
    cancelStream,
    withdrawFromStream,
    addRecipient,
    removeRecipient,
    updateRecipientRate,
    isPending,
    isConfirming,
    isConfirmed,
    hash,
    error,
  };
}

/**
 * Hook for reading stream data
 */
export function useStream(streamId: bigint | undefined) {
  const chainId = useChainId();
  const contractAddress = useMemo(() => {
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  const { data: stream, isLoading, error, refetch } = useReadContract({
    address: contractAddress || undefined,
    abi: DRIP_CORE_ABI,
    functionName: "getStream",
    args: streamId !== undefined ? [streamId] : undefined,
    query: {
      enabled: !!streamId && !!contractAddress,
    },
  });

  return { stream, isLoading, error, refetch };
}

/**
 * Hook for getting recipient balance in a stream
 */
export function useRecipientBalance(streamId: bigint | undefined, recipient: `0x${string}` | undefined) {
  const chainId = useChainId();
  const contractAddress = useMemo(() => {
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  const { data: balance, isLoading, error } = useReadContract({
    address: contractAddress || undefined,
    abi: DRIP_CORE_ABI,
    functionName: "getRecipientBalance",
    args: streamId !== undefined && recipient ? [streamId, recipient] : undefined,
    query: {
      enabled: !!streamId && !!recipient && !!contractAddress,
    },
  });

  return { balance, isLoading, error };
}

/**
 * Hook for getting user's streams
 */
export function useUserStreams(userAddress: `0x${string}` | undefined) {
  const chainId = useChainId();
  const contractAddress = useMemo(() => {
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  // Note: This assumes there's a function to get user streams
  // You may need to implement this differently based on your contract
  const { data: streamIds, isLoading, error } = useReadContract({
    address: contractAddress || undefined,
    abi: DRIP_CORE_ABI,
    functionName: "getUserStreams",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!contractAddress,
    },
  });

  return { streamIds, isLoading, error };
}

