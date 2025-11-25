"use client";

import { useAccount, useChainId, useReadContract } from "wagmi";
import { useMemo, useEffect } from "react";
import { getContractAddress } from "../config";
import { DRIP_CORE_ABI } from "../abis";

/**
 * Hook for getting streams where user is the sender
 */
export function useUserSentStreams(userAddress: `0x${string}` | undefined) {
  const chainId = useChainId();
  const contractAddress = useMemo(() => {
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  const { data: streams, isLoading, error, refetch } = useReadContract({
    address: contractAddress || undefined,
    abi: DRIP_CORE_ABI,
    functionName: "getUserSentStreams",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!contractAddress,
      refetchInterval: 10000, // Refetch every 10 seconds for real-time updates
      // Force refetch when address changes
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  });

  // Refetch when address changes - this ensures fresh data when wallet switches
  useEffect(() => {
    if (userAddress && contractAddress) {
      // Small delay to ensure the query is properly set up
      const timeoutId = setTimeout(() => {
        refetch();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [userAddress, contractAddress, refetch]);

  return { streams, isLoading, error, refetch };
}

/**
 * Hook for getting streams where user is a recipient
 */
export function useUserReceivedStreams(userAddress: `0x${string}` | undefined) {
  const chainId = useChainId();
  const contractAddress = useMemo(() => {
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  const { data: streams, isLoading, error, refetch } = useReadContract({
    address: contractAddress || undefined,
    abi: DRIP_CORE_ABI,
    functionName: "getUserReceivedStreams",
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!userAddress && !!contractAddress,
      refetchInterval: 10000, // Refetch every 10 seconds for real-time updates
      // Force refetch when address changes
      refetchOnMount: true,
      refetchOnWindowFocus: true,
    },
  });

  // Refetch when address changes - this ensures fresh data when wallet switches
  useEffect(() => {
    if (userAddress && contractAddress) {
      // Small delay to ensure the query is properly set up
      const timeoutId = setTimeout(() => {
        refetch();
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [userAddress, contractAddress, refetch]);

  return { streams, isLoading, error, refetch };
}

/**
 * Hook for getting all streams (sent + received) for a user
 */
export function useAllUserStreams(userAddress: `0x${string}` | undefined) {
  const sentStreams = useUserSentStreams(userAddress);
  const receivedStreams = useUserReceivedStreams(userAddress);

  const allStreams = useMemo(() => {
    // If no address, return undefined immediately
    if (!userAddress) return undefined;
    
    // If both are still loading or undefined, return undefined
    if (sentStreams.isLoading || receivedStreams.isLoading) {
      return undefined;
    }
    
    const sent = sentStreams.streams || [];
    const received = receivedStreams.streams || [];
    
    // If both are empty arrays, return empty array
    if (sent.length === 0 && received.length === 0) {
      return [];
    }
    
    // Combine and deduplicate by streamId
    const streamMap = new Map();
    
    sent.forEach((stream: any) => {
      streamMap.set(Number(stream.streamId), { ...stream, userRole: "sender" });
    });
    
    received.forEach((stream: any) => {
      const existing = streamMap.get(Number(stream.streamId));
      if (existing) {
        existing.userRole = "both";
      } else {
        streamMap.set(Number(stream.streamId), { ...stream, userRole: "recipient" });
      }
    });
    
    return Array.from(streamMap.values());
  }, [userAddress, sentStreams.streams, sentStreams.isLoading, receivedStreams.streams, receivedStreams.isLoading]);

  return {
    streams: allStreams,
    isLoading: sentStreams.isLoading || receivedStreams.isLoading,
    error: sentStreams.error || receivedStreams.error,
    refetch: () => {
      sentStreams.refetch();
      receivedStreams.refetch();
    },
  };
}

