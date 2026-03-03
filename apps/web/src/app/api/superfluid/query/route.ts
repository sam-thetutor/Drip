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
    });

    const recipientInfo = await publicClient.readContract({
      address: DRIP_CONTRACT,
      abi: SUPERFLUID_GDA_ABI,
      functionName: 'getRecipientInfo',
      args: [BigInt(streamId), recipient as `0x${string}`],
    });

    const claimableBalance = await publicClient.readContract({
      address: DRIP_CONTRACT,
      abi: SUPERFLUID_GDA_ABI,
      functionName: 'getRecipientBalance',
      args: [BigInt(streamId), recipient as `0x${string}`],
    });

    const [title, sender, deposit, startTime, endTime, status, recipients] = streamInfo as [
      string, string, bigint, bigint, bigint, number, string[]
    ];
    const [ratePerSecond, totalWithdrawn, lastWithdrawTime, currentAccrued] = recipientInfo as [
      bigint, bigint, bigint, bigint
    ];

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
