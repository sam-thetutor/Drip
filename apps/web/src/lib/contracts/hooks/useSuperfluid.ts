'use client';

import { useEffect, useState } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { getContractAddress, getGDAForwarderAddress } from '../config';
import { SUPERFLUID_GDA_ABI, GDA_FORWARDER_ABI } from '../superfluid.abi';

export interface SuperfluidRecipientInfo {
  recipient: string;
  ratePerSecond: bigint;
  totalWithdrawn: bigint;
  lastWithdrawTime: bigint;
  currentAccrued: bigint;
}

export interface SuperfluidStreamData {
  streamId: number;
  title: string;
  sender: string;
  token: string;
  deposit: bigint;
  startTime: bigint;
  endTime: bigint;
  status: number;
  recipients: string[];
  recipientInfo?: SuperfluidRecipientInfo;
  claimableNow: bigint;
}

/**
 * Hook to get user's Superfluid streams (both sent and received)
 */
export function useSuperfluidStreams(userAddress?: `0x${string}`) {
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId, 'DripCoreSuperfluid');

  const { data, isLoading, error } = useReadContracts({
    contracts: [
      {
        address: contractAddress || undefined,
        abi: SUPERFLUID_GDA_ABI,
        functionName: 'getSenderStreams',
        args: userAddress ? [userAddress] : undefined,
      },
      {
        address: contractAddress || undefined,
        abi: SUPERFLUID_GDA_ABI,
        functionName: 'getRecipientStreams',
        args: userAddress ? [userAddress] : undefined,
      },
    ],
    query: {
      enabled: !!contractAddress && !!userAddress,
    },
  });

  // Combine sent and received streams, removing duplicates
  let streamIds: bigint[] | undefined;
  if (data) {
    const senderStreams = (data[0]?.result as bigint[]) || [];
    const recipientStreams = (data[1]?.result as bigint[]) || [];
    const combined = [...senderStreams, ...recipientStreams];
    // Remove duplicates
    const uniqueIds = Array.from(new Set(combined.map(id => id.toString()))).map(id => BigInt(id));
    streamIds = uniqueIds;
  }

  return {
    streamIds,
    isLoading,
    error,
  };
}

/**
 * Hook to get detailed stream data with recipient info
 */
export function useSuperfluidStreamData(streamId?: bigint, recipient?: `0x${string}`) {
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId, 'DripCoreSuperfluid');

  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      {
        address: contractAddress || undefined,
        abi: SUPERFLUID_GDA_ABI,
        functionName: 'getStream',
        args: streamId !== undefined ? [streamId] : undefined,
      },
      {
        address: contractAddress || undefined,
        abi: SUPERFLUID_GDA_ABI,
        functionName: 'getRecipientInfo',
        args: streamId !== undefined && recipient ? [streamId, recipient] : undefined,
      },
      {
        address: contractAddress || undefined,
        abi: SUPERFLUID_GDA_ABI,
        functionName: 'getRecipientBalance',
        args: streamId !== undefined && recipient ? [streamId, recipient] : undefined,
      },
    ],
    query: {
      enabled: !!contractAddress && streamId !== undefined,
    },
  });

  const [streamData, setStreamData] = useState<SuperfluidStreamData | null>(null);

  useEffect(() => {
    if (!data || !data[0]?.result) return;

    const [streamResult, recipientResult, balanceResult] = data;

    if (streamResult.status !== 'success') return;

    const stream = streamResult.result as {
      streamId: bigint;
      sender: string;
      recipients: string[];
      token: string;
      deposit: bigint;
      startTime: bigint;
      endTime: bigint;
      status: number;
      rateLockUntil: bigint;
      title: string;
      description: string;
    };

    const streamInfo: SuperfluidStreamData = {
      streamId: Number(stream.streamId),
      title: stream.title,
      sender: stream.sender,
      token: stream.token,
      deposit: stream.deposit,
      startTime: stream.startTime,
      endTime: stream.endTime,
      status: stream.status,
      recipients: stream.recipients,
      claimableNow: balanceResult?.status === 'success' ? (balanceResult.result as bigint) : 0n,
    };

    if (recipientResult?.status === 'success' && recipient) {
      const info = recipientResult.result as {
        recipient: string;
        ratePerSecond: bigint;
        totalWithdrawn: bigint;
        lastWithdrawTime: bigint;
        currentAccrued: bigint;
      };

      streamInfo.recipientInfo = {
        recipient,
        ratePerSecond: info.ratePerSecond,
        totalWithdrawn: info.totalWithdrawn,
        lastWithdrawTime: info.lastWithdrawTime,
        currentAccrued: info.currentAccrued,
      };
    }

    setStreamData(streamInfo);
  }, [data, streamId, recipient]);

  return {
    streamData,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to check if a recipient is connected to a stream's GDA pool,
 * and to connect them if not. Once connected, tokens flow automatically
 * to their wallet — no manual claiming needed.
 */
export function usePoolConnection(streamId?: bigint, memberAddress?: `0x${string}`) {
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId, 'DripCoreSuperfluid');
  const gdaForwarderAddress = getGDAForwarderAddress(chainId);

  // 1. Get the pool address for this stream
  const { data: poolAddress } = useReadContract({
    address: contractAddress || undefined,
    abi: SUPERFLUID_GDA_ABI,
    functionName: 'getStreamPool',
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: !!contractAddress && streamId !== undefined },
  });

  // 2. Check if member is already connected to the pool
  const { data: isConnected, refetch: refetchConnection } = useReadContract({
    address: gdaForwarderAddress || undefined,
    abi: GDA_FORWARDER_ABI,
    functionName: 'isMemberConnected',
    args: poolAddress && memberAddress ? [poolAddress as `0x${string}`, memberAddress] : undefined,
    query: {
      enabled: !!gdaForwarderAddress && !!poolAddress && !!memberAddress && poolAddress !== '0x0000000000000000000000000000000000000000',
    },
  });

  // 3. Connect to pool
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const connectToPool = () => {
    if (!gdaForwarderAddress || !poolAddress) {
      throw new Error('Pool or GDA forwarder not available');
    }

    writeContract({
      address: gdaForwarderAddress,
      abi: GDA_FORWARDER_ABI,
      functionName: 'connectPool',
      args: [poolAddress as `0x${string}`, '0x'],
      gas: BigInt(500_000),
    });
  };

  // Refetch connection status after successful connect
  useEffect(() => {
    if (isConfirmed) {
      refetchConnection();
    }
  }, [isConfirmed, refetchConnection]);

  return {
    poolAddress: poolAddress as `0x${string}` | undefined,
    isConnected: isConnected as boolean | undefined,
    connectToPool,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to claim from Superfluid stream (fallback for unconnected members)
 */
export function useSuperfluidClaim() {
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId, 'DripCoreSuperfluid');

  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const claim = (streamId: number, recipient: `0x${string}`) => {
    if (!contractAddress) {
      throw new Error('DripCoreSuperfluid contract not deployed on this network');
    }

    writeContract({
      address: contractAddress,
      abi: SUPERFLUID_GDA_ABI,
      functionName: 'withdrawFromStream',
      args: [BigInt(streamId), recipient],
      gas: BigInt(1_000_000),
    });
  };

  return {
    claim,
    isPending,
    isConfirming,
    isConfirmed,
    error,
    hash,
  };
}

/**
 * Hook to auto-refresh stream data every 10 seconds
 */
export function useAutoRefreshStreamData(streamId?: bigint, recipient?: `0x${string}`) {
  const { streamData, isLoading, error, refetch } = useSuperfluidStreamData(streamId, recipient);

  useEffect(() => {
    if (!streamId || !recipient) return;

    const interval = setInterval(() => {
      refetch();
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [streamId, recipient, refetch]);

  return { streamData, isLoading, error, refetch };
}
