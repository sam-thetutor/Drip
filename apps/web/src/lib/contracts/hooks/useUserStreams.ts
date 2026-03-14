"use client";

import { useChainId, useReadContract } from "wagmi";
import { useMemo } from "react";
import { getContractAddress } from "../config";
import { DRIP_CORE_ABI } from "../abis";

const QUERY_OPTIONS = {
  refetchInterval: 30000,
  refetchOnMount: true,
  refetchOnWindowFocus: false,
  staleTime: 20 * 1000,
};

/**
 * Hook for getting streams where user is the sender — queries a single contract address.
 */
function useSentStreamsFromContract(
  userAddress: `0x${string}` | undefined,
  contractAddress: `0x${string}` | null | undefined
) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress || undefined,
    abi: DRIP_CORE_ABI,
    functionName: "getUserSentStreams",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!contractAddress, ...QUERY_OPTIONS },
  });
  return { streams: data as any[] | undefined, isLoading, error, refetch };
}

/**
 * Hook for getting streams where user is a recipient — queries a single contract address.
 */
function useReceivedStreamsFromContract(
  userAddress: `0x${string}` | undefined,
  contractAddress: `0x${string}` | null | undefined
) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: contractAddress || undefined,
    abi: DRIP_CORE_ABI,
    functionName: "getUserReceivedStreams",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress && !!contractAddress, ...QUERY_OPTIONS },
  });
  return { streams: data as any[] | undefined, isLoading, error, refetch };
}

// ─── Public hooks (kept for backward compat) ────────────────────────────────

export function useUserSentStreams(userAddress: `0x${string}` | undefined) {
  const chainId = useChainId();
  const contractAddress = useMemo(() => getContractAddress(chainId, "DripCore"), [chainId]);
  return useSentStreamsFromContract(userAddress, contractAddress);
}

export function useUserReceivedStreams(userAddress: `0x${string}` | undefined) {
  const chainId = useChainId();
  const contractAddress = useMemo(() => getContractAddress(chainId, "DripCore"), [chainId]);
  return useReceivedStreamsFromContract(userAddress, contractAddress);
}

/**
 * Queries ALL known contract addresses (DripCore + DripCoreSuperfluid legacy) and 
 * merges results so streams created on either deployment are always visible.
 */
export function useAllUserStreams(userAddress: `0x${string}` | undefined) {
  const chainId = useChainId();

  const primaryAddr = useMemo(() => getContractAddress(chainId, "DripCore"), [chainId]);
  // Legacy address: older streams may have been created here before the V4 redeployment
  const legacyAddr = useMemo(() => {
    const superfluid = getContractAddress(chainId, "DripCoreSuperfluid");
    // Only add as legacy if it is a DIFFERENT address from the primary
    return superfluid && superfluid !== primaryAddr ? superfluid : null;
  }, [chainId, primaryAddr]);

  // Primary contract
  const primarySent = useSentStreamsFromContract(userAddress, primaryAddr);
  const primaryRecv = useReceivedStreamsFromContract(userAddress, primaryAddr);

  // Legacy contract (only fires actual requests when legacyAddr is non-null)
  const legacySent = useSentStreamsFromContract(userAddress, legacyAddr);
  const legacyRecv = useReceivedStreamsFromContract(userAddress, legacyAddr);

  const isLoading =
    primarySent.isLoading ||
    primaryRecv.isLoading ||
    (!!legacyAddr && (legacySent.isLoading || legacyRecv.isLoading));

  const allStreams = useMemo(() => {
    if (!userAddress) return undefined;
    if (isLoading) return undefined;

    const sentArrays: any[] = [
      ...(primarySent.streams || []),
      ...(legacyAddr ? legacySent.streams || [] : []),
    ];
    const recvArrays: any[] = [
      ...(primaryRecv.streams || []),
      ...(legacyAddr ? legacyRecv.streams || [] : []),
    ];

    if (sentArrays.length === 0 && recvArrays.length === 0) return [];

    // Deduplicate by streamId — prefer the first occurrence (primary over legacy)
    const streamMap = new Map<number, any>();

    sentArrays.forEach((stream: any) => {
      const id = Number(stream.streamId);
      if (!streamMap.has(id)) {
        streamMap.set(id, { ...stream, userRole: "sender" });
      }
    });

    recvArrays.forEach((stream: any) => {
      const id = Number(stream.streamId);
      const existing = streamMap.get(id);
      if (existing) {
        existing.userRole = "both";
      } else {
        streamMap.set(id, { ...stream, userRole: "recipient" });
      }
    });

    return Array.from(streamMap.values());
  }, [
    userAddress,
    isLoading,
    primarySent.streams,
    primaryRecv.streams,
    legacySent.streams,
    legacyRecv.streams,
    legacyAddr,
  ]);

  return {
    streams: allStreams,
    isLoading,
    error: primarySent.error || primaryRecv.error,
    refetch: () => {
      primarySent.refetch();
      primaryRecv.refetch();
      if (legacyAddr) {
        legacySent.refetch();
        legacyRecv.refetch();
      }
    },
  };
}

