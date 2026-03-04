import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { celo } from 'viem/chains';
import { SUPERFLUID_GDA_ABI } from '@/lib/contracts/superfluid.abi';
import { CONTRACT_ADDRESSES, CELO_MAINNET_ID } from '@/lib/contracts/config';

const DRIP_CONTRACT = CONTRACT_ADDRESSES[CELO_MAINNET_ID].DripCoreSuperfluid;

const publicClient = createPublicClient({
  chain: celo,
  transport: http()
});

// Type definitions for contract return values
type StreamInfo = {
  streamId: bigint;
  sender: `0x${string}`;
  recipients: readonly `0x${string}`[];
  token: `0x${string}`;
  deposit: bigint;
  startTime: bigint;
  endTime: bigint;
  status: number;
  rateLockUntil: bigint;
  title: string;
  description: string;
};

type RecipientInfo = {
  ratePerSecond: bigint;
  totalWithdrawn: bigint;
  lastWithdrawTime: bigint;
  currentAccrued: bigint;
};

export async function POST(request: NextRequest) {
  try {
    const { streamId, recipient } = await request.json();

    if (!streamId || !recipient) {
      return NextResponse.json(
        { error: 'Missing streamId or recipient' },
        { status: 400 }
      );
    }

    // Query all stream data
    const streamInfo = await publicClient.readContract({
      address: DRIP_CONTRACT,
      abi: SUPERFLUID_GDA_ABI,
      functionName: 'getStream',
      args: [BigInt(streamId)],
    }) as unknown as StreamInfo;

    const recipientInfo = await publicClient.readContract({
      address: DRIP_CONTRACT,
      abi: SUPERFLUID_GDA_ABI,
      functionName: 'getRecipientInfo',
      args: [BigInt(streamId), recipient as `0x${string}`],
    }) as unknown as RecipientInfo;

    const claimableBalance = await publicClient.readContract({
      address: DRIP_CONTRACT,
      abi: SUPERFLUID_GDA_ABI,
      functionName: 'getRecipientBalance',
      args: [BigInt(streamId), recipient as `0x${string}`],
    }) as bigint;

    // Extract stream data from object (contract returns struct, not tuple)
    const { title, sender, deposit, startTime, endTime, status, recipients } = streamInfo;
    const { ratePerSecond, totalWithdrawn, lastWithdrawTime, currentAccrued } = recipientInfo;

    // Calculate rates and projections
    const now = BigInt(Math.floor(Date.now() / 1000));
    const flowRatePerHour = ratePerSecond * 3600n;
    const flowRatePerDay = ratePerSecond * 86400n;
    
    const timeRemainingSeconds = endTime > now ? Number(endTime - now) : 0;
    const projectedTotal = totalWithdrawn + claimableBalance + (ratePerSecond * BigInt(timeRemainingSeconds));

    const response = {
      streamId,
      title,
      sender,
      deposit: deposit.toString(),
      startTime: startTime.toString(),
      endTime: endTime.toString(),
      status,
      recipients,
      recipientInfo: {
        recipient,
        ratePerSecond: ratePerSecond.toString(),
        totalWithdrawn: totalWithdrawn.toString(),
        lastWithdrawTime: lastWithdrawTime.toString(),
        currentAccrued: currentAccrued.toString()
      },
      claimableNow: claimableBalance.toString(),
      flowRatePerHour: flowRatePerHour.toString(),
      flowRatePerDay: flowRatePerDay.toString(),
      projectedTotal: projectedTotal.toString(),
      timeRemainingSeconds,
      // Human-readable values for convenience
      formatted: {
        claimableNow: formatEther(claimableBalance),
        flowRatePerHour: formatEther(flowRatePerHour),
        flowRatePerDay: formatEther(flowRatePerDay),
        totalWithdrawn: formatEther(totalWithdrawn),
        projectedTotal: formatEther(projectedTotal)
      }
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error querying stream:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to query stream data' },
      { status: 500 }
    );
  }
}
