"use client";

import { useRef, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther, erc20Abi, maxUint256 } from "viem";
import { DRIP_STAKING_V2_ABI } from "../abis";
import { getContractAddress } from "../config";

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

export function useStakingV2() {
  const { address } = useAccount();
  const chainId = 42220; // Celo Mainnet
  const stakingAddress = getContractAddress(chainId, "DripStakingV2") ?? undefined;

  // Stores the amount the user wants to stake while we wait for approval to confirm
  const pendingStakeRef = useRef<bigint | null>(null);

  // ── Write contracts ──────────────────────────────────────────
  const { data: stakeHash,      isPending: isStakePending,      writeContract: writeStake }      = useWriteContract();
  const { data: unstakeHash,    isPending: isUnstakePending,    writeContract: writeUnstake }    = useWriteContract();
  const { data: checkpointHash, isPending: isCheckpointPending, writeContract: writeCheckpoint } = useWriteContract();
  const { data: approveHash,    isPending: isApprovePending,    writeContract: writeApprove }    = useWriteContract();

  // ── Transaction receipts ─────────────────────────────────────
  const { isLoading: isStakeConfirming,      isSuccess: isStakeConfirmed }      = useWaitForTransactionReceipt({ hash: stakeHash });
  const { isLoading: isUnstakeConfirming,    isSuccess: isUnstakeConfirmed }    = useWaitForTransactionReceipt({ hash: unstakeHash });
  const { isLoading: isCheckpointConfirming, isSuccess: isCheckpointConfirmed } = useWaitForTransactionReceipt({ hash: checkpointHash });
  const { isLoading: isApproveConfirming,    isSuccess: isApproveConfirmed }    = useWaitForTransactionReceipt({ hash: approveHash });

  // ── Read: token address ──────────────────────────────────────
  const { data: tokenAddress } = useReadContract({
    address: stakingAddress,
    abi: DRIP_STAKING_V2_ABI,
    functionName: "token",
    query: { enabled: !!stakingAddress },
  });

  // ── Read: allowance ──────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && stakingAddress ? [address, stakingAddress as `0x${string}`] : undefined,
    query: { enabled: !!address && !!stakingAddress && !!tokenAddress },
  });

  // ── Read: token balance ──────────────────────────────────────
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!tokenAddress, refetchInterval: 5000 },
  });

  // ── Read: full staker info ───────────────────────────────────
  const { data: stakerInfo, refetch: refetchStakerInfo } = useReadContract({
    address: stakingAddress,
    abi: DRIP_STAKING_V2_ABI,
    functionName: "getStakerInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!stakingAddress, refetchInterval: 3000 },
  });

  // ── Read: live points ───────────────────────────────────────
  const { data: livePoints, refetch: refetchPoints } = useReadContract({
    address: stakingAddress,
    abi: DRIP_STAKING_V2_ABI,
    functionName: "getPoints",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!stakingAddress,
      refetchInterval: 1000, // poll every second for live counter feel
    },
  });

  // ── Read: global stats ───────────────────────────────────────
  const { data: totalStaked,       refetch: refetchTotalStaked }  = useReadContract({
    address: stakingAddress,
    abi: DRIP_STAKING_V2_ABI,
    functionName: "totalStaked",
    query: { enabled: !!stakingAddress, refetchInterval: 5000 },
  });

  const { data: totalPointsIssued, refetch: refetchTotalPoints }  = useReadContract({
    address: stakingAddress,
    abi: DRIP_STAKING_V2_ABI,
    functionName: "totalPointsIssued",
    query: { enabled: !!stakingAddress, refetchInterval: 5000 },
  });

  // ── Parsed values ────────────────────────────────────────────
  const info = Array.isArray(stakerInfo) ? stakerInfo : [];
  const stakedAmount    = (info[0] as bigint | undefined) ?? 0n;
  const totalPoints     = (info[1] as bigint | undefined) ?? 0n;
  const pointsPerSecond = (info[2] as bigint | undefined) ?? 0n;
  const lastUpdate      = (info[3] as bigint | undefined) ?? 0n;

  // Points are raw integers (contract divides by 1e18 denominator already — do NOT use formatEther)
  const rawPoints = (livePoints as bigint) ?? 0n;
  const pointsDisplay = rawPoints.toString();

  const stakedDisplay    = formatEther(stakedAmount);
  const balanceDisplay   = formatEther(tokenBalance as bigint ?? 0n);
  const totalStakedDisplay = formatEther(totalStaked as bigint ?? 0n);

  // pointsPerSecond is also a raw integer: stakedAmount / POINTS_DENOMINATOR
  const pointsPerDay = Number(pointsPerSecond) * 86400;

  // ── Actions ──────────────────────────────────────────────────

  const approveToken = (amount: bigint) => {
    if (!tokenAddress || !stakingAddress) return;
    writeApprove({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      // Approve MaxUint256 so the user never needs to approve again
      args: [stakingAddress as `0x${string}`, maxUint256],
    });
  };

  // When approval confirms, refetch allowance then submit the pending stake automatically
  useEffect(() => {
    if (!isApproveConfirmed) return;
    refetchAllowance().then(() => {
      const pending = pendingStakeRef.current;
      if (pending && stakingAddress) {
        pendingStakeRef.current = null;
        writeStake({
          address: stakingAddress,
          abi: DRIP_STAKING_V2_ABI,
          functionName: "stake",
          args: [pending],
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveConfirmed]);

  const stakeTokens = (amount: string) => {
    if (!stakingAddress) return;
    const amountBigInt = parseEther(amount);

    if (!allowance || (allowance as bigint) < amountBigInt) {
      // Store the intended amount, approve unlimited, then auto-stake on confirm
      pendingStakeRef.current = amountBigInt;
      approveToken(amountBigInt);
      return;
    }

    writeStake({
      address: stakingAddress,
      abi: DRIP_STAKING_V2_ABI,
      functionName: "stake",
      args: [amountBigInt],
    });
  };

  const unstakeTokens = (amount: string) => {
    if (!stakingAddress) return;
    writeUnstake({
      address: stakingAddress,
      abi: DRIP_STAKING_V2_ABI,
      functionName: "unstake",
      args: [parseEther(amount)],
    });
  };

  const checkpointMyPoints = () => {
    if (!stakingAddress) return;
    writeCheckpoint({
      address: stakingAddress,
      abi: DRIP_STAKING_V2_ABI,
      functionName: "checkpointPoints",
    });
  };

  const refetchAll = () => {
    refetchStakerInfo();
    refetchPoints();
    refetchTotalStaked();
    refetchTotalPoints();
    refetchAllowance();
    refetchBalance();
  };

  return {
    // addresses
    stakingAddress,
    tokenAddress: tokenAddress as `0x${string}` | undefined,

    // parsed user state
    stakedAmount,
    stakedDisplay,
    totalPoints,
    pointsDisplay,
    pointsPerSecond,
    pointsPerDay,
    lastUpdate,
    balanceDisplay,
    tokenBalance: (tokenBalance as bigint) ?? 0n,
    allowance: (allowance as bigint) ?? 0n,

    // global state
    totalStaked: (totalStaked as bigint) ?? 0n,
    totalStakedDisplay,
    totalPointsIssued: (totalPointsIssued as bigint) ?? 0n,

    // actions
    stakeTokens,
    unstakeTokens,
    approveToken,
    checkpointMyPoints,
    refetchAll,

    // pending / confirming states
    isStakePending,
    isStakeConfirming,
    isStakeConfirmed,
    isUnstakePending,
    isUnstakeConfirming,
    isUnstakeConfirmed,
    isApprovePending,
    isApproveConfirming,
    isApproveConfirmed,
    isCheckpointPending,
    isCheckpointConfirming,
    isCheckpointConfirmed,

    needsApproval: (amount: string) => {
      try {
        return !allowance || (allowance as bigint) < parseEther(amount);
      } catch {
        return true;
      }
    },
  };
}
