import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { DripStakingABI } from '../abis';
import { getContractAddress } from '../config';

export function useStaking() {
  const { address, chain } = useAccount();
  const chainId = chain?.id ?? 42220;
  const stakingAddress = getContractAddress(chainId, 'DripStaking') ?? undefined;

  // Write functions
  const { data: stakeHash, isPending: isStakePending, writeContract: stake } = useWriteContract();
  const { data: unstakeHash, isPending: isUnstakePending, writeContract: unstake } = useWriteContract();
  const { data: claimHash, isPending: isClaimPending, writeContract: claim } = useWriteContract();
  const { data: approveHash, isPending: isApprovePending, writeContract: approveWrite } = useWriteContract();
  const { data: connectHash, isPending: isConnectPending, writeContract: connect } = useWriteContract();
  const { data: disconnectHash, isPending: isDisconnectPending, writeContract: disconnect } = useWriteContract();

  // Transaction receipts
  const { isLoading: isStakeConfirming } = useWaitForTransactionReceipt({ hash: stakeHash });
  const { isLoading: isUnstakeConfirming } = useWaitForTransactionReceipt({ hash: unstakeHash });
  const { isLoading: isClaimConfirming } = useWaitForTransactionReceipt({ hash: claimHash });
  const { isLoading: isConnectConfirming } = useWaitForTransactionReceipt({ hash: connectHash });
  const { isLoading: isDisconnectConfirming } = useWaitForTransactionReceipt({ hash: disconnectHash });

  // Read: getStakeInfo
  const { data: stakeInfo, refetch: refetchStakeInfo } = useReadContract({
    address: stakingAddress,
    abi: DripStakingABI,
    functionName: 'getStakeInfo',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!stakingAddress,
      refetchInterval: 2000, // Refetch every 2 seconds for real-time updates
    },
  });

  // Read: getPoolUnits
  const { data: poolUnits, refetch: refetchPoolUnits } = useReadContract({
    address: stakingAddress,
    abi: DripStakingABI,
    functionName: 'getPoolUnits',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!stakingAddress,
      refetchInterval: 3000, // Refetch every 3 seconds
    },
  });

  // Read: totalStaked
  const { data: totalStaked, refetch: refetchTotalStaked } = useReadContract({
    address: stakingAddress,
    abi: DripStakingABI,
    functionName: 'totalStaked',
    query: {
      enabled: !!stakingAddress,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  });

  // Read: rewardFlowRate
  const { data: rewardFlowRate, refetch: refetchRewardFlowRate } = useReadContract({
    address: stakingAddress,
    abi: DripStakingABI,
    functionName: 'rewardFlowRate',
    query: {
      enabled: !!stakingAddress,
    },
  });

  // Read: getClaimableRewards
  const { data: claimableRewards, refetch: refetchClaimable } = useReadContract({
    address: stakingAddress,
    abi: DripStakingABI,
    functionName: 'getClaimableRewards',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!stakingAddress,
      refetchInterval: 1000, // Refetch every second for live streaming effect
    },
  });

  // Read: isConnectedToPool
  const { data: isConnected, refetch: refetchConnection } = useReadContract({
    address: stakingAddress,
    abi: DripStakingABI,
    functionName: 'isConnectedToPool',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!stakingAddress,
      refetchInterval: 2000, // Refetch every 2 seconds
    },
  });

  // Read: superToken address
  const { data: superToken } = useReadContract({
    address: stakingAddress,
    abi: DripStakingABI,
    functionName: 'superToken',
    query: {
      enabled: !!stakingAddress,
    },
  });

  // Read: token allowance for staking contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: superToken as `0x${string}`,
    abi: [
      {
        inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
        name: 'allowance',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    functionName: 'allowance',
    args: [address as `0x${string}`, stakingAddress as `0x${string}`],
    query: {
      enabled: !!address && !!stakingAddress && !!superToken,
    },
  });

  // Parse stake info
  const stakedAmount = stakeInfo && Array.isArray(stakeInfo) && stakeInfo.length >= 1 ? (stakeInfo[0] as bigint) : 0n;
  const claimedAmount = stakeInfo && Array.isArray(stakeInfo) && stakeInfo.length >= 2 ? (stakeInfo[1] as bigint) : 0n;
  const rewardRate = stakeInfo && Array.isArray(stakeInfo) && stakeInfo.length >= 3 ? (stakeInfo[2] as bigint) : 0n;

  // Calculate APY: (rewardFlowRate * 365 days * 100) / totalStaked
  const calculateAPY = () => {
    if (!totalStaked || totalStaked === 0n || !rewardFlowRate) return 0;
    const flow = typeof rewardFlowRate === 'bigint' ? rewardFlowRate : BigInt(String(rewardFlowRate));
    const yearlyRewards = flow * BigInt(365 * 24 * 60 * 60);
    const apy = (Number(yearlyRewards) / Number(totalStaked)) * 100;
    return apy;
  };

  // Approve function
  const approveToken = (amount: bigint) => {
    if (!superToken || !stakingAddress) return;
    approveWrite({
      address: superToken as `0x${string}`,
      abi: [
        {
          inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
          name: 'approve',
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function',
        },
      ],
      functionName: 'approve',
      args: [stakingAddress, amount],
    });
  };

  // Stake function
  const stakeTokens = async (amount: string) => {
    if (!stakingAddress) return;
    
    const amountBigInt = parseEther(amount);
    
    // Check if approval is needed
    if (!allowance || allowance < amountBigInt) {
      approveToken(amountBigInt * 2n); // Approve 2x to avoid future approvals
      return;
    }
    
    stake({
      address: stakingAddress,
      abi: DripStakingABI,
      functionName: 'stake',
      args: [amountBigInt],
    });
  };

  // Unstake function
  const unstakeTokens = (amount: string) => {
    if (!stakingAddress) return;
    unstake({
      address: stakingAddress,
      abi: DripStakingABI,
      functionName: 'unstake',
      args: [parseEther(amount)],
    });
  };

  // Claim rewards function
  const claimRewards = () => {
    if (!stakingAddress) return;
    claim({
      address: stakingAddress,
      abi: DripStakingABI,
      functionName: 'claimRewards',
    });
  };

  // Connect to pool function
  const connectToPool = () => {
    if (!stakingAddress) return;
    connect({
      address: stakingAddress,
      abi: DripStakingABI,
      functionName: 'connectToPool',
    });
  };

  // Disconnect from pool function
  const disconnectFromPool = () => {
    if (!stakingAddress) return;
    disconnect({
      address: stakingAddress,
      abi: DripStakingABI,
      functionName: 'disconnectFromPool',
    });
  };

  // Refetch all data
  const refetchAll = () => {
    refetchStakeInfo();
    refetchPoolUnits();
    refetchTotalStaked();
    refetchRewardFlowRate();
    refetchClaimable();
    refetchConnection();
  };

  return {
    // Contract info
    stakingAddress,
    superToken,
    allowance: allowance || 0n,
    
    // User stake data
    stakedAmount,
    claimedAmount,
    rewardRate,
    poolUnits: (poolUnits as bigint) || 0n,
    
    // Pool data
    totalStaked: (totalStaked as bigint) || 0n,
    rewardFlowRate: (rewardFlowRate as bigint) || 0n,
    claimableRewards: (claimableRewards as bigint) || 0n,
    apy: calculateAPY(),
    
    // Pool connection
    isConnected: Boolean(isConnected),
    
    // Actions
    stake: stakeTokens,
    unstake: unstakeTokens,
    claimRewards,
    connectToPool,
    disconnectFromPool,
    approveToken,
    refetchAll,
    refetchAllowance,
    
    // Transaction states
    isStakePending,
    isStakeConfirming,
    stakeHash,
    
    isUnstakePending,
    isUnstakeConfirming,
    unstakeHash,
    
    isClaimPending,
    isClaimConfirming,
    claimHash,
    
    isConnectPending,
    isConnectConfirming,
    connectHash,
    
    isDisconnectPending,
    isDisconnectConfirming,
    disconnectHash,
    
    isApprovePending,
    approveHash,
  };
}
