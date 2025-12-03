import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, decodeEventLog, type Chain } from "viem";
import { celo } from "viem/chains";
import {
  celoSepolia,
  CELO_SEPOLIA_ID,
  CELO_MAINNET_ID,
  getContractAddress,
  DRIP_CORE_ABI,
} from "@/lib/contracts";
import { prisma } from "@/lib/prisma";

// Simple scores for now – can be tuned later
const STREAM_CREATED_POINTS = 10;
const WITHDRAWAL_POINTS = 5;

// Force dynamic rendering (this route uses request.url and database)
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Optional query params: network, reset, fromBlock
    const url = new URL(req.url);
    const network = url.searchParams.get("network") ?? "sepolia"; // "sepolia" | "mainnet"
    const reset = url.searchParams.get("reset") === "true";
    const fromBlockParam = url.searchParams.get("fromBlock");

    // Select chain + RPC based on network
    let chain: Chain = celoSepolia;
    let chainId = CELO_SEPOLIA_ID;
    let rpcUrl =
      process.env.CELO_SEPOLIA_RPC_URL ??
      process.env.CELO_RPC_URL ??
      "https://forno.celo-sepolia.celo-testnet.org";

    if (network === "mainnet") {
      chain = celo;
      chainId = CELO_MAINNET_ID;
      rpcUrl =
        process.env.CELO_MAINNET_RPC_URL ??
        process.env.CELO_RPC_URL ??
        "https://forno.celo.org";
    }

    if (!rpcUrl) {
      return NextResponse.json(
        { error: "RPC URL env var not set for selected network" },
        { status: 500 }
      );
    }

    const dripCoreAddress = getContractAddress(chainId, "DripCore");
    if (!dripCoreAddress) {
      return NextResponse.json(
        { error: `DripCore not deployed on chain ${chainId}` },
        { status: 500 }
      );
    }

    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // 1. Load last processed block (per network)
    const stateId = network === "mainnet" ? 2 : 1;
    let state = await prisma.indexerState.findUnique({ where: { id: stateId } });
    const latestBlock = await client.getBlockNumber();

    const MAX_RANGE = 5000n;
    let fromBlock: bigint;

    if (reset) {
      // Explicit reset: start from provided fromBlock or 0
      fromBlock = fromBlockParam ? BigInt(fromBlockParam) : 0n;
      if (!state) {
        state = await prisma.indexerState.create({
          data: { id: stateId, lastProcessedBlock: fromBlock },
        });
      } else {
        await prisma.indexerState.update({
          where: { id: stateId },
          data: { lastProcessedBlock: fromBlock },
        });
      }
    } else {
      if (!state || state.lastProcessedBlock === 0n) {
        // First run: only look back a limited window
        fromBlock = latestBlock > MAX_RANGE ? latestBlock - MAX_RANGE : 0n;
        if (!state) {
          state = await prisma.indexerState.create({
            data: { id: stateId, lastProcessedBlock: fromBlock },
          });
        }
      } else {
        fromBlock = state.lastProcessedBlock + 1n;
      }
    }

    if (fromBlock > latestBlock) {
      return NextResponse.json({
        message: "No new blocks to index",
        fromBlock: fromBlock.toString(),
        toBlock: latestBlock.toString(),
      });
    }

    const toBlock = latestBlock;

    // 2. Fetch events
    // Fetch all logs for DripCore in the range; we'll decode events manually
    const rawLogs = await client.getLogs({
      address: dripCoreAddress,
      fromBlock,
      toBlock,
    });

    let createdCount = 0;
    let withdrawnCount = 0;

    // 3. Decode and process events
    for (const log of rawLogs) {
      let decoded: any;
      try {
        decoded = decodeEventLog({
          abi: DRIP_CORE_ABI as any,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        continue;
      }

      if (decoded.eventName === "StreamCreated") {
        const sender = (decoded.args.sender as string).toLowerCase();
        const deposit = (decoded.args.deposit as bigint) ?? 0n;

        await prisma.userStats.upsert({
          where: { address: sender },
          create: {
            address: sender,
            streamsCreated: 1,
            withdrawalsClaimed: 0,
            totalDeposited: deposit.toString(),
            totalWithdrawn: "0",
            points: STREAM_CREATED_POINTS,
          },
          update: {
            streamsCreated: { increment: 1 },
            totalDeposited: { increment: deposit.toString() },
          },
        });

        const stats = await prisma.userStats.findUnique({
          where: { address: sender },
        });
        if (stats) {
          const points =
            stats.streamsCreated * STREAM_CREATED_POINTS +
            stats.withdrawalsClaimed * WITHDRAWAL_POINTS;
          await prisma.userStats.update({
            where: { address: sender },
            data: { points },
          });
        }

        createdCount++;
      }

      if (decoded.eventName === "StreamWithdrawn") {
        const recipient = (decoded.args.recipient as string).toLowerCase();
        const amount = (decoded.args.amount as bigint) ?? 0n;

        await prisma.userStats.upsert({
          where: { address: recipient },
          create: {
            address: recipient,
            streamsCreated: 0,
            withdrawalsClaimed: 1,
            totalDeposited: "0",
            totalWithdrawn: amount.toString(),
            points: WITHDRAWAL_POINTS,
          },
          update: {
            withdrawalsClaimed: { increment: 1 },
            totalWithdrawn: { increment: amount.toString() },
          },
        });

        const stats = await prisma.userStats.findUnique({
          where: { address: recipient },
        });
        if (stats) {
          const points =
            stats.streamsCreated * STREAM_CREATED_POINTS +
            stats.withdrawalsClaimed * WITHDRAWAL_POINTS;
          await prisma.userStats.update({
            where: { address: recipient },
            data: { points },
          });
        }

        withdrawnCount++;
      }
    }

    // 5. Update indexer state
    await prisma.indexerState.update({
      where: { id: stateId },
      data: { lastProcessedBlock: toBlock },
    });

    return NextResponse.json({
      message: "Sync complete",
      network,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      processed: {
        streamCreated: createdCount,
        streamWithdrawn: withdrawnCount,
      },
    });
  } catch (error) {
    console.error("Error in /api/leaderboard/sync:", error);
    return NextResponse.json(
      { error: "Failed to sync leaderboard" },
      { status: 500 }
    );
  }
}


