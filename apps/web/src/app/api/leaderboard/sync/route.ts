import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, decodeEventLog, type Chain, defineChain } from "viem";
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
      chainId = CELO_MAINNET_ID;
      // Use the public RPC endpoint for mainnet
      // Prioritize CELO_MAINNET_RPC_URL, then default to mainnet URL
      // Don't use generic CELO_RPC_URL as it might be set to testnet
      rpcUrl =
        process.env.CELO_MAINNET_RPC_URL ?? "https://forno.celo.org";
      console.log(`[Leaderboard Sync] Using RPC URL: ${rpcUrl}`);
      
      // Create custom chain definition to ensure correct RPC
      chain = defineChain({
        id: CELO_MAINNET_ID,
        name: "Celo",
        nativeCurrency: {
          decimals: 18,
          name: "CELO",
          symbol: "CELO",
        },
        rpcUrls: {
          default: {
            http: [rpcUrl],
          },
        },
        blockExplorers: {
          default: {
            name: "CeloScan",
            url: "https://celoscan.io",
          },
        },
      });
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

    // For mainnet, also check implementation address if it's a proxy
    // Mainnet proxy: 0x5530975fDe062FE6706298fF3945E3d1a17A310a
    // Mainnet implementation: 0x8F4C50979efb901C50e79e11DdC2a45FD1451eE3
    const implementationAddress = 
      network === "mainnet" && dripCoreAddress === "0x5530975fDe062FE6706298fF3945E3d1a17A310a"
        ? ("0x8F4C50979efb901C50e79e11DdC2a45FD1451eE3" as `0x${string}`)
        : null;

    // Create client with explicit RPC URL to ensure correct network
    const client = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // 1. Load last processed block (per network)
    const stateId = network === "mainnet" ? 2 : 1;
    let state = await prisma.indexerState.findUnique({ where: { id: stateId } });
    
    // Get latest block - try direct RPC call first to ensure accuracy
    let latestBlock: bigint;
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
      });
      if (!response.ok) {
        throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
      }
      if (data.result) {
        // Parse hex string to bigint (remove 0x prefix if present)
        const hexValue = data.result.startsWith('0x') ? data.result : `0x${data.result}`;
        latestBlock = BigInt(hexValue);
        console.log(`[Leaderboard Sync] Got latest block from direct RPC: ${latestBlock.toString()} (hex: ${data.result})`);
      } else {
        console.error(`[Leaderboard Sync] RPC response error:`, data);
        throw new Error(`No result from RPC: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      console.error(`[Leaderboard Sync] Direct RPC failed, using client:`, error);
      // Fallback to client method
      latestBlock = await client.getBlockNumber();
      console.log(`[Leaderboard Sync] Got latest block from client: ${latestBlock.toString()}`);
    }

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
    // For proxy contracts, events are emitted from the proxy address
    console.log(`[Leaderboard Sync] Fetching logs from block ${fromBlock} to ${toBlock} for address ${dripCoreAddress}`);
    
    let rawLogs = await client.getLogs({
      address: dripCoreAddress,
      fromBlock,
      toBlock,
    });

    // Also check implementation address if it's a proxy (events might be there)
    if (implementationAddress) {
      console.log(`[Leaderboard Sync] Also checking implementation address ${implementationAddress}`);
      const implLogs = await client.getLogs({
        address: implementationAddress,
        fromBlock,
        toBlock,
      });
      rawLogs = [...rawLogs, ...implLogs];
    }

    console.log(`[Leaderboard Sync] Found ${rawLogs.length} total raw logs`);

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
      contractAddress: dripCoreAddress,
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      rawLogsCount: rawLogs.length,
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


