"use client";

/**
 * useStreamActivity
 *
 * Fetches on-chain DripV4 events (StreamCreated, Cancelled, Completed,
 * Resumed, ToppedUp) for all streams the connected user is involved in,
 * then returns them sorted newest-first with resolved block timestamps.
 *
 * Strategy:
 *   1. Get user stream IDs from getSenderStreams + getRecipientStreams.
 *   2. Fetch events via getLogs for each event type:
 *      - StreamCreated:  filter by sender address (indexed)
 *      - All others:     filter by streamId[] (indexed, OR semantics)
 *   3. Resolve unique block timestamps in a single parallel batch.
 *   4. Return sorted, enriched ActivityEvent list.
 */

import { useEffect, useState, useMemo, useRef } from "react";
import { usePublicClient, useChainId } from "wagmi";
import { parseAbi } from "viem";
import { useDripV4StreamIds } from "./useDripV4";
import { getContractAddress } from "../config";

// ─── Event types ─────────────────────────────────────────────────────────────

export type ActivityEventType =
  | "created"
  | "cancelled"
  | "completed"
  | "resumed"
  | "topped_up";

export interface ActivityEvent {
  id:          string;              // unique key = txHash + logIndex
  type:        ActivityEventType;
  streamId:    bigint;
  txHash:      `0x${string}`;
  blockNumber: bigint;
  timestamp:   number;              // Unix seconds — from block or event arg
  // Event-specific optional fields
  title?:      string;              // StreamCreated only
  token?:      `0x${string}`;      // StreamCreated only
  refund?:     bigint;              // StreamCancelled
  newEndTime?: bigint;              // StreamResumed, StreamToppedUp
  // Enriched by hook
  userRole?:   "sender" | "recipient" | "both";
}

// ─── ABI fragments (only what getLogs needs) ──────────────────────────────────

const EVENTS_ABI = parseAbi([
  "event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed token, address[] recipients, int96[] flowRates, int96 totalFlowRate, uint256 totalAmount, uint256 depositAmount, uint256 feeAmount, address vault, uint256 startTime, uint256 endTime, string title)",
  "event StreamCancelled(uint256 indexed streamId, address indexed vault, uint256 refundAmount, uint256 finishTime)",
  "event StreamCompleted(uint256 indexed streamId, address indexed vault, uint256 finishTime)",
  "event StreamResumed(uint256 indexed streamId, uint256 newEndTime)",
  "event StreamToppedUp(uint256 indexed streamId, uint256 newEndTime)",
]);

// ─── Constants ────────────────────────────────────────────────────────────────

/** Celo ~5 sec/block → 14 days ≈ 242,000 blocks */
const LOOKBACK_BLOCKS = 300_000n;

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useStreamActivity(
  userAddress: `0x${string}` | undefined,
  limit = 100,
) {
  const chainId      = useChainId();
  const publicClient = usePublicClient();
  const dripV4Addr   = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);

  const { sentIds, receivedIds, isLoading: idsLoading } = useDripV4StreamIds(userAddress);

  const [events,    setEvents]    = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const allIds = useMemo(() => {
    const seen = new Set<string>();
    const out: bigint[] = [];
    for (const id of [...sentIds, ...receivedIds]) {
      const key = id.toString();
      if (!seen.has(key)) { seen.add(key); out.push(id); }
    }
    return out;
  }, [sentIds, receivedIds]);

  const sentSet = useMemo(
    () => new Set(sentIds.map((id) => id.toString())),
    [sentIds],
  );
  const recvSet = useMemo(
    () => new Set(receivedIds.map((id) => id.toString())),
    [receivedIds],
  );

  // Track last fetch input to avoid redundant re-fetches
  const lastFetchKey = useRef<string>("");

  useEffect(() => {
    if (!publicClient || !dripV4Addr || !userAddress || idsLoading) return;

    // Deduplicate fetches when nothing meaningful changed
    const fetchKey = `${userAddress}-${allIds.join(",")}-${chainId}`;
    if (fetchKey === lastFetchKey.current) return;
    lastFetchKey.current = fetchKey;

    let cancelled = false;

    async function fetchAll() {
      setIsLoading(true);
      setError(null);
      try {
        const addr       = dripV4Addr as `0x${string}`;
        const latestBlock = await publicClient!.getBlockNumber();
        const fromBlock   = latestBlock > LOOKBACK_BLOCKS ? latestBlock - LOOKBACK_BLOCKS : 0n;

        // Batch all getLogs calls in parallel.
        // We split large ID arrays into chunks of 50 to stay within RPC limits.
        const idChunks: bigint[][] = [];
        for (let i = 0; i < allIds.length; i += 50) idChunks.push(allIds.slice(i, i + 50));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const safeGetLogs = async (opts: any) => {
          try { return await publicClient!.getLogs(opts); }
          catch { return []; }
        };

        const [createdLogs, ...restLogs] = await Promise.all([
          // StreamCreated — filter by sender (second indexed topic)
          safeGetLogs({
            address: addr,
            event: EVENTS_ABI[0],
            args: { sender: userAddress },
            fromBlock,
            toBlock: "latest",
          }),
          // For each other event type (4 types × N id-chunks)
          ...([1, 2, 3, 4] as const).flatMap((evIdx) =>
            idChunks.length > 0
              ? idChunks.map((chunk) =>
                  safeGetLogs({
                    address: addr,
                    event: EVENTS_ABI[evIdx],
                    args: { streamId: chunk as any },
                    fromBlock,
                    toBlock: "latest",
                  }),
                )
              : [Promise.resolve([])],
          ),
        ]);

        if (cancelled) return;

        // Flatten the rest back into arrays per event type
        const chunkCount   = Math.max(idChunks.length, 1);
        const cancelledLogs  = restLogs.slice(0,              chunkCount).flat();
        const completedLogs  = restLogs.slice(chunkCount,     chunkCount * 2).flat();
        const resumedLogs    = restLogs.slice(chunkCount * 2, chunkCount * 3).flat();
        const toppedUpLogs   = restLogs.slice(chunkCount * 3, chunkCount * 4).flat();

        // Collect all unique block numbers — then batch-fetch their timestamps
        const blockNums = new Set<bigint>();
        for (const log of [...createdLogs, ...cancelledLogs, ...completedLogs, ...resumedLogs, ...toppedUpLogs]) {
          if ((log as any).blockNumber) blockNums.add((log as any).blockNumber as bigint);
        }

        // Fetch block timestamps — at most ~100 RPC calls but usually far fewer
        const blockTimestamps = new Map<string, number>();
        await Promise.all(
          [...blockNums].map(async (bn) => {
            try {
              const block = await publicClient!.getBlock({ blockNumber: bn, includeTransactions: false });
              blockTimestamps.set(bn.toString(), Number(block.timestamp));
            } catch {
              // Fallback: use event arg timestamps if available, else 0
            }
          }),
        );

        if (cancelled) return;

        const ts = (blockNumber: bigint, fallback = 0): number =>
          blockTimestamps.get(blockNumber.toString()) ?? fallback;

        const role = (streamId: bigint): "sender" | "recipient" | "both" => {
          const k = streamId.toString();
          const isSender = sentSet.has(k);
          const isRecipient = recvSet.has(k);
          return isSender && isRecipient ? "both" : isSender ? "sender" : "recipient";
        };

        const allEvents: ActivityEvent[] = [];

        for (const log of createdLogs as any[]) {
          allEvents.push({
            id:          `${log.transactionHash}-${log.logIndex}`,
            type:        "created",
            streamId:    log.args.streamId as bigint,
            txHash:      log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp:   ts(log.blockNumber, Number(log.args.startTime ?? 0)),
            title:       log.args.title as string | undefined,
            token:       log.args.token as `0x${string}`,
            userRole:    role(log.args.streamId as bigint),
          });
        }

        for (const log of cancelledLogs as any[]) {
          allEvents.push({
            id:          `${log.transactionHash}-${log.logIndex}`,
            type:        "cancelled",
            streamId:    log.args.streamId as bigint,
            txHash:      log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp:   ts(log.blockNumber, Number(log.args.finishTime ?? 0)),
            refund:      log.args.refundAmount as bigint,
            userRole:    role(log.args.streamId as bigint),
          });
        }

        for (const log of completedLogs as any[]) {
          allEvents.push({
            id:          `${log.transactionHash}-${log.logIndex}`,
            type:        "completed",
            streamId:    log.args.streamId as bigint,
            txHash:      log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp:   ts(log.blockNumber, Number(log.args.finishTime ?? 0)),
            userRole:    role(log.args.streamId as bigint),
          });
        }

        for (const log of resumedLogs as any[]) {
          allEvents.push({
            id:          `${log.transactionHash}-${log.logIndex}`,
            type:        "resumed",
            streamId:    log.args.streamId as bigint,
            txHash:      log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp:   ts(log.blockNumber),
            newEndTime:  log.args.newEndTime as bigint,
            userRole:    role(log.args.streamId as bigint),
          });
        }

        for (const log of toppedUpLogs as any[]) {
          allEvents.push({
            id:          `${log.transactionHash}-${log.logIndex}`,
            type:        "topped_up",
            streamId:    log.args.streamId as bigint,
            txHash:      log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp:   ts(log.blockNumber),
            newEndTime:  log.args.newEndTime as bigint,
            userRole:    role(log.args.streamId as bigint),
          });
        }

        // Sort newest-first, deduplicate by id
        const seen = new Set<string>();
        const deduped = allEvents.filter((e) => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        deduped.sort((a, b) => (a.blockNumber > b.blockNumber ? -1 : 1));

        setEvents(deduped.slice(0, limit));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load activity");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicClient, dripV4Addr, userAddress, chainId, allIds.join(","), idsLoading]);

  return { events, isLoading: isLoading || idsLoading, error };
}
