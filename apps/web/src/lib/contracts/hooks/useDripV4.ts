"use client";

/**
 * useDripV4.ts
 *
 * Complete hook library for DripV4 — the vault-model streaming contract.
 *
 * Stream struct (on-chain):
 *   streamId, sender, recipients[], token, flowRates[], totalFlowRate,
 *   totalAmount, depositAmount, vault, startTime, endTime, finishTime,
 *   pausedAt, status, title, description
 *
 * StreamStatus enum:  Active=0  Paused=1  Completed=2  Cancelled=3
 */

import { useCallback, useEffect, useMemo } from "react";
import {
  useChainId,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { erc20Abi } from "viem";
import { DRIP_V4_ABI } from "../abis";
import { getContractAddress } from "../config";
import { useRefetchBalances } from "./useRefetchBalances";

// ─── Types ────────────────────────────────────────────────────────────────────

export const StreamStatus = {
  Active:    0,
  Paused:    1,
  Completed: 2,
  Cancelled: 3,
} as const;

export type StreamStatusValue = (typeof StreamStatus)[keyof typeof StreamStatus];

export type StreamStatusLabel = "Active" | "Paused" | "Completed" | "Cancelled";

export function getStatusLabel(status: number): StreamStatusLabel {
  switch (status) {
    case 0: return "Active";
    case 1: return "Paused";
    case 2: return "Completed";
    case 3: return "Cancelled";
    default: return "Active";
  }
}

/** Mirrors the on-chain Stream struct returned by DripV4.getStream() */
export interface DripV4Stream {
  streamId:      bigint;
  sender:        `0x${string}`;
  recipients:    `0x${string}`[];
  token:         `0x${string}`;
  flowRates:     bigint[];       // per-recipient rates (int96 → bigint)
  totalFlowRate: bigint;         // sum of all flowRates
  totalAmount:   bigint;         // net amount after fee
  depositAmount: bigint;         // totalAmount + buffer (what vault holds)
  vault:         `0x${string}`;
  startTime:     bigint;
  endTime:       bigint;
  finishTime:    bigint;         // 0 while active/paused
  pausedAt:      bigint;         // 0 if not currently paused
  status:        number;
  title:         string;
  description:   string;
  // Client-side enriched fields:
  userRole?:          "sender" | "recipient" | "both";
  vaultBalance?:      bigint;
  amountStreamed?:    bigint;
  percentComplete?:   number;
}

export interface DripV4Analytics {
  totalStreams:    number;
  activeStreams:   number;
  pausedStreams:   number;
  currentOutflow: bigint;   // wei/s sent by this user
  currentInflow:  bigint;   // wei/s received by this user
  totalSent:      bigint;
  totalReceived:  bigint;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BUFFER_SECONDS = 14_400n;

// ─── Swap-funding (USDC → G$) constants ─────────────────────────────────────────
// Uniswap V3 on Celo (verified Jun 2026). Path is reverse-encoded for exactOutput:
//   G$ →(10000 / 1%)→ cUSD →(100 / 0.01%)→ USDC
const QUOTER_ADDRESS = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8" as const;
const CUSD_ADDRESS   = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const;
const GOOD_DOLLAR    = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A" as const;
const USDC_ADDRESS   = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;
const SWAP_SLIPPAGE_BPS = 100n; // 1% headroom over the quoted USDC input

const QUOTER_EXACT_OUTPUT_ABI = [
  { name: "quoteExactOutput", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "path", type: "bytes" }, { name: "amountOut", type: "uint256" }],
    outputs: [{ name: "amountIn", type: "uint256" }] },
] as const;

/** Reverse-encoded exactOutput path: G$ →(1%)→ cUSD →(0.01%)→ USDC */
function buildExactOutputPath(): `0x${string}` {
  const s = (a: string) => a.slice(2).toLowerCase();
  return `0x${s(GOOD_DOLLAR)}002710${s(CUSD_ADDRESS)}000064${s(USDC_ADDRESS)}` as `0x${string}`;
}

const QUERY_OPTS = {
  refetchInterval:      30_000,
  staleTime:            20_000,
  refetchOnWindowFocus: false,
} as const;

// ─── Parse helpers ────────────────────────────────────────────────────────────

function parseTupleToStream(raw: unknown): DripV4Stream | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  try {
    return {
      streamId:      BigInt(t.streamId      as bigint),
      sender:        t.sender               as `0x${string}`,
      recipients:    (t.recipients          as `0x${string}`[]) ?? [],
      token:         t.token                as `0x${string}`,
      flowRates:     ((t.flowRates          as bigint[]) ?? []).map(BigInt),
      totalFlowRate: BigInt(t.totalFlowRate as bigint ?? 0n),
      totalAmount:   BigInt(t.totalAmount   as bigint),
      depositAmount: BigInt(t.depositAmount as bigint),
      vault:         t.vault                as `0x${string}`,
      startTime:     BigInt(t.startTime     as bigint),
      endTime:       BigInt(t.endTime       as bigint),
      finishTime:    BigInt(t.finishTime    as bigint),
      pausedAt:      BigInt(t.pausedAt      as bigint ?? 0n),
      status:        Number(t.status),
      title:         String(t.title         ?? ""),
      description:   String(t.description   ?? ""),
    };
  } catch {
    return null;
  }
}

function computeAmountStreamed(stream: DripV4Stream): bigint {
  if (stream.totalFlowRate === 0n || stream.startTime === 0n) return 0n;
  if (stream.status === StreamStatus.Completed || stream.status === StreamStatus.Cancelled) {
    return stream.totalAmount;
  }
  const now     = BigInt(Math.floor(Date.now() / 1000));
  // For paused streams, count only up to when it was paused
  const elapsed = stream.pausedAt > 0n
    ? (stream.pausedAt > stream.startTime ? stream.pausedAt - stream.startTime : 0n)
    : (now > stream.startTime ? now - stream.startTime : 0n);
  const streamed = elapsed * stream.totalFlowRate;
  return streamed > stream.totalAmount ? stream.totalAmount : streamed;
}

/**
 * Progress is measured against the funded runway, not the original planned
 * amount. When we know the live vault balance we derive remaining runway from
 * it (balance ÷ flow rate) — this stays correct even when the on-chain endTime
 * is stale after top-ups. Falls back to the time-based endTime calc otherwise.
 */
function computePercentComplete(stream: DripV4Stream, vaultBalance?: bigint): number {
  if (stream.status === StreamStatus.Completed) return 100;
  if (stream.startTime === 0n) return 0;

  // Paused plans freeze progress at the moment they were paused.
  const ref = stream.pausedAt > 0n
    ? stream.pausedAt
    : BigInt(Math.floor(Date.now() / 1000));
  const elapsed = ref > stream.startTime ? ref - stream.startTime : 0n;

  // Preferred: live vault balance is the source of truth for remaining runway.
  if (vaultBalance !== undefined && stream.totalFlowRate > 0n) {
    const remaining = vaultBalance / stream.totalFlowRate; // seconds of runway left
    const total = elapsed + remaining;
    if (total === 0n) return 100;
    return Number((elapsed * 10_000n) / total) / 100;
  }

  // Fallback: time-based against the on-chain endTime.
  if (stream.endTime <= stream.startTime) return 0;
  const total = stream.endTime - stream.startTime;
  const capped = elapsed > total ? total : elapsed;
  return Number((capped * 10_000n) / total) / 100;
}

// ─── Read hooks ───────────────────────────────────────────────────────────────

/** Stream IDs sent/received by a user address */
export function useDripV4StreamIds(userAddress: `0x${string}` | undefined) {
  const chainId    = useChainId();
  const addr       = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const enabled    = !!userAddress && !!addr;

  const { data: sentIds,     isLoading: l1, refetch: r1 } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "getSenderStreams",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled, ...QUERY_OPTS },
  });

  const { data: receivedIds, isLoading: l2, refetch: r2 } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "getRecipientStreams",
    args: userAddress ? [userAddress] : undefined,
    query: { enabled, ...QUERY_OPTS },
  });

  return {
    sentIds:     (sentIds     as bigint[] | undefined) ?? [],
    receivedIds: (receivedIds as bigint[] | undefined) ?? [],
    isLoading:   l1 || l2,
    refetch:     () => { r1(); r2(); },
  };
}

/** Batch-read full stream structs for an array of IDs (multicall) */
export function useDripV4StreamDetails(streamIds: bigint[]) {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);

  const contracts = useMemo(() => {
    if (!addr || streamIds.length === 0) return [];
    return streamIds.map((id) => ({
      address:      addr as `0x${string}`,
      abi:          DRIP_V4_ABI as unknown[],
      functionName: "getStream" as const,
      args:         [id] as const,
    }));
  }, [addr, streamIds]);

  const { data, isLoading, refetch } = useReadContracts({
    contracts: contracts as any,
    query: { enabled: contracts.length > 0, ...QUERY_OPTS },
  });

  const streamMap = useMemo(() => {
    const map = new Map<string, DripV4Stream>();
    if (!data) return map;
    (data as any[]).forEach((result: any, i: number) => {
      if (result.status === "success" && result.result) {
        const stream = parseTupleToStream(result.result);
        if (stream) map.set(streamIds[i].toString(), stream);
      }
    });
    return map;
  }, [data, streamIds]);

  return { streamMap, isLoading, refetch };
}

/** Real-time vault balances for a list of streams (reads via DripV4.getVaultBalance) */
export function useDripV4VaultBalances(streams: DripV4Stream[]) {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);

  const liveStreams = useMemo(
    () => streams.filter((s) => s.status === StreamStatus.Active || s.status === StreamStatus.Paused),
    [streams]
  );

  const contracts = useMemo(() => {
    if (!addr || liveStreams.length === 0) return [];
    return liveStreams.map((s) => ({
      address:      addr as `0x${string}`,
      abi:          DRIP_V4_ABI as unknown[],
      functionName: "getVaultBalance" as const,
      args:         [s.streamId] as const,
    }));
  }, [addr, liveStreams]);

  const { data, isLoading } = useReadContracts({
    contracts: contracts as any,
    query: {
      enabled:         contracts.length > 0,
      refetchInterval: 10_000,
      staleTime:       8_000,
    },
  });

  const balanceMap = useMemo(() => {
    const map = new Map<string, bigint>();
    if (!data) return map;
    (data as any[]).forEach((result: any, i: number) => {
      if (result.status === "success" && result.result !== undefined) {
        map.set(liveStreams[i].streamId.toString(), result.result as bigint);
      }
    });
    return map;
  }, [data, liveStreams]);

  return { balanceMap, isLoading };
}

/**
 * Primary read hook — all DripV4 streams for a user with role tagging + analytics.
 */
export function useDripV4Streams(userAddress: `0x${string}` | undefined) {
  const { sentIds, receivedIds, isLoading: idsLoading, refetch: refetchIds } =
    useDripV4StreamIds(userAddress);

  const allIds = useMemo(() => {
    const seen = new Set<string>();
    const out: bigint[] = [];
    for (const id of [...sentIds, ...receivedIds]) {
      const key = id.toString();
      if (!seen.has(key)) { seen.add(key); out.push(id); }
    }
    return out;
  }, [sentIds, receivedIds]);

  const { streamMap, isLoading: streamsLoading, refetch: refetchStreams } =
    useDripV4StreamDetails(allIds);

  const streamList = useMemo(() => Array.from(streamMap.values()), [streamMap]);
  const { balanceMap } = useDripV4VaultBalances(streamList);

  const enrichedStreams = useMemo((): DripV4Stream[] => {
    if (!userAddress) return [];
    const sentSet = new Set(sentIds.map((id) => id.toString()));
    const recvSet = new Set(receivedIds.map((id) => id.toString()));

    return allIds.flatMap((id) => {
      const s = streamMap.get(id.toString());
      if (!s) return [];

      const isSender    = sentSet.has(id.toString());
      const isRecipient = recvSet.has(id.toString());
      const role: "sender" | "recipient" | "both" =
        isSender && isRecipient ? "both"
        : isSender              ? "sender"
        :                         "recipient";

      const vaultBalance = balanceMap.get(id.toString());
      const amountStreamed = computeAmountStreamed(s);

      return [{
        ...s,
        userRole:       role,
        vaultBalance,
        amountStreamed,
        percentComplete: computePercentComplete(s, vaultBalance),
      }];
    });
  }, [userAddress, allIds, streamMap, balanceMap, sentIds, receivedIds]);

  const analytics = useMemo((): DripV4Analytics => {
    const addr = userAddress?.toLowerCase();
    if (!addr) return {
      totalStreams: 0, activeStreams: 0, pausedStreams: 0,
      currentOutflow: 0n, currentInflow: 0n, totalSent: 0n, totalReceived: 0n,
    };

    let active = 0, paused = 0;
    let outflow = 0n, inflow = 0n, sent = 0n, received = 0n;

    for (const s of enrichedStreams) {
      const isSender    = s.sender.toLowerCase() === addr;
      const isRecipient = s.recipients.some((r) => r.toLowerCase() === addr);

      if (s.status === StreamStatus.Active)  active++;
      if (s.status === StreamStatus.Paused)  paused++;

      if (s.status === StreamStatus.Active) {
        if (isSender)    outflow  += s.totalFlowRate;
        if (isRecipient) {
          const idx = s.recipients.findIndex((r) => r.toLowerCase() === addr);
          if (idx >= 0) inflow += s.flowRates[idx] ?? 0n;
        }
      }

      if (s.status === StreamStatus.Completed || s.status === StreamStatus.Cancelled) {
        if (isSender)    sent     += s.amountStreamed ?? 0n;
        if (isRecipient) received += s.amountStreamed ?? 0n;
      }
    }

    return {
      totalStreams: enrichedStreams.length,
      activeStreams: active,
      pausedStreams: paused,
      currentOutflow: outflow,
      currentInflow:  inflow,
      totalSent:      sent,
      totalReceived:  received,
    };
  }, [enrichedStreams, userAddress]);

  return {
    streams:   enrichedStreams,
    analytics,
    isLoading: idsLoading || streamsLoading,
    refetch:   () => { refetchIds(); refetchStreams(); },
  };
}

/** Single stream with live vault balance */
export function useDripV4Stream(streamId: bigint | undefined) {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);

  const { data: raw, isLoading, refetch } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "getStream",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: !!streamId && !!addr, refetchInterval: 15_000, staleTime: 10_000 },
  });

  const { data: vaultBal } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "getVaultBalance",
    args: streamId !== undefined ? [streamId] : undefined,
    query: {
      enabled: !!streamId && !!addr && !!raw &&
        [StreamStatus.Active, StreamStatus.Paused].includes((raw as any)?.status),
      refetchInterval: 10_000,
      staleTime: 8_000,
    },
  });

  const stream = useMemo((): DripV4Stream | null => {
    if (!raw) return null;
    const s = parseTupleToStream(raw);
    if (!s) return null;
    const vaultBalance   = vaultBal as bigint | undefined;
    const amountStreamed = computeAmountStreamed(s);
    return {
      ...s,
      vaultBalance,
      amountStreamed,
      percentComplete: computePercentComplete(s, vaultBalance),
    };
  }, [raw, vaultBal]);

  return { stream, isLoading, refetch };
}

/** Currently active recipients + their live rates for a stream */
export function useDripV4ActiveRecipients(streamId: bigint | undefined) {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);

  const { data, isLoading, refetch } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "getActiveRecipients",
    args: streamId !== undefined ? [streamId] : undefined,
    query: { enabled: !!streamId && !!addr, refetchInterval: 15_000 },
  });

  const result = data as [`0x${string}`[], bigint[]] | undefined;

  return {
    recipients: result?.[0] ?? [],
    flowRates:  result?.[1] ?? [],
    isLoading,
    refetch,
  };
}

/** Per-recipient pause/remove status flags */
export function useDripV4RecipientStatus(
  streamId: bigint | undefined,
  recipient: `0x${string}` | undefined
) {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const enabled = !!streamId && !!recipient && !!addr;

  const { data: isPaused,  refetch: r1 } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "isRecipientPaused",
    args: streamId && recipient ? [streamId, recipient] : undefined,
    query: { enabled, ...QUERY_OPTS },
  });

  const { data: isRemoved, refetch: r2 } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "isRecipientRemoved",
    args: streamId && recipient ? [streamId, recipient] : undefined,
    query: { enabled, ...QUERY_OPTS },
  });

  return {
    isPaused:  (isPaused  as boolean | undefined) ?? false,
    isRemoved: (isRemoved as boolean | undefined) ?? false,
    refetch:   () => { r1(); r2(); },
  };
}

/** Total stream count (for dashboard stats) */
export function useDripV4StreamCount() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { data, isLoading } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "streamCount",
    query: { enabled: !!addr, ...QUERY_OPTS },
  });
  return { count: data as bigint | undefined, isLoading };
}

/** Helper: compute the recommended deposit approval amount */
export function useDripV4RecommendedDeposit(
  totalFlowRate: bigint,
  grossTotalAmount: bigint
) {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const enabled = totalFlowRate > 0n && grossTotalAmount > 0n && !!addr;

  const { data } = useReadContract({
    address: addr ?? undefined,
    abi: DRIP_V4_ABI,
    functionName: "getRecommendedDeposit",
    args: enabled ? [totalFlowRate, grossTotalAmount] : undefined,
    query: { enabled },
  });

  // Fallback: compute client-side (same formula as contract)
  const fallback = grossTotalAmount + totalFlowRate * BUFFER_SECONDS;
  return (data as bigint | undefined) ?? fallback;
}

/**
 * Quote how much USDC is needed to acquire `neededGd` G$ via Uniswap V3 (exactOutput).
 * `neededGd` should be the full amount the stream consumes = grossTotalAmount + buffer.
 * Returns the quoted USDC input and a slippage-padded `maxUsdcIn` to approve/spend.
 */
export function useUsdcSwapQuote(neededGd: bigint) {
  const path    = useMemo(() => buildExactOutputPath(), []);
  const enabled = neededGd > 0n;

  const { data, isLoading, isError, refetch } = useReadContract({
    address: QUOTER_ADDRESS,
    abi: QUOTER_EXACT_OUTPUT_ABI,
    functionName: "quoteExactOutput",
    args: [path, neededGd],
    query: { enabled, retry: 1, staleTime: 15_000, refetchInterval: 20_000 },
  });

  const usdcIn = (data as bigint | undefined) ?? 0n;
  const maxUsdcIn = usdcIn > 0n
    ? usdcIn + (usdcIn * SWAP_SLIPPAGE_BPS) / 10_000n
    : 0n;

  return { usdcIn, maxUsdcIn, isLoading, isError, refetch, usdcAddress: USDC_ADDRESS };
}

// ─── Write hooks ──────────────────────────────────────────────────────────────

/**
 * Create a new DripV4 stream.
 * Handles both the ERC20 approval and the createStream call.
 * Returns separate functions so the UI can show a 2-step progress indicator.
 */
export function useCreateDripV4Stream() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);

  const { writeContractAsync: approve,  isPending: approvePending  } = useWriteContract();
  const { writeContractAsync: create,   isPending: createPending   } = useWriteContract();

  const approveToken = useCallback(async (
    tokenAddress: `0x${string}`,
    amount: bigint
  ): Promise<`0x${string}`> => {
    if (!addr) throw new Error("DripV4 not deployed on this network");
    return approve({
      address: tokenAddress,
      abi:     erc20Abi,
      functionName: "approve",
      args:    [addr as `0x${string}`, amount],
    });
  }, [addr, approve]);

  const createStream = useCallback(async (params: {
    recipients:  `0x${string}`[];
    token:       `0x${string}`;
    flowRates:   bigint[];
    totalAmount: bigint;
    title:       string;
    description: string;
  }): Promise<`0x${string}`> => {
    if (!addr) throw new Error("DripV4 not deployed on this network");
    return create({
      address: addr as `0x${string}`,
      abi:     DRIP_V4_ABI,
      functionName: "createStream",
      args: [
        params.recipients,
        params.token,
        params.flowRates,
        params.totalAmount,
        params.title,
        params.description,
      ],
    });
  }, [addr, create]);

  /**
   * Create a G$ stream funded by paying USDC. The contract swaps USDC → G$
   * (exactOutput) for exactly what the stream needs and refunds unused USDC.
   * Approve USDC for `maxAmountIn` (from useUsdcSwapQuote) before calling.
   */
  const createStreamWithSwap = useCallback(async (params: {
    maxAmountIn: bigint;          // USDC to approve/spend (slippage-padded quote)
    recipients:  `0x${string}`[];
    flowRates:   bigint[];        // G$ wei/s per recipient
    totalAmount: bigint;          // gross G$ to stream
    title:       string;
    description: string;
  }): Promise<`0x${string}`> => {
    if (!addr) throw new Error("DripV5 not deployed on this network");
    return create({
      address: addr as `0x${string}`,
      abi:     DRIP_V4_ABI,
      functionName: "createStreamWithSwap",
      args: [
        params.maxAmountIn,
        params.recipients,
        params.flowRates,
        params.totalAmount,
        params.title,
        params.description,
      ],
    });
  }, [addr, create]);

  return {
    approveToken,
    createStream,
    createStreamWithSwap,
    isPending: approvePending || createPending,
  };
}

export function usePauseStream() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const pauseStream = useCallback(async (streamId: bigint) => {
    if (!addr) throw new Error("DripV4 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "pauseStream",
      args: [streamId],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  return { pauseStream, isPending: isPending || isConfirming };
}

export function useResumeStream() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const resumeStream = useCallback(async (streamId: bigint) => {
    if (!addr) throw new Error("DripV4 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "resumeStream",
      args: [streamId],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  return { resumeStream, isPending: isPending || isConfirming };
}

export function useCancelStream() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const cancelStream = useCallback(async (streamId: bigint) => {
    if (!addr) throw new Error("DripV4 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "cancelStream",
      args: [streamId],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Cancelling refunds the stream's remaining balance to the wallet.
  const refetchBalances = useRefetchBalances();
  useEffect(() => { if (isSuccess) refetchBalances(); }, [isSuccess, refetchBalances]);

  return { cancelStream, isPending: isPending || isConfirming };
}

export function useRefreshEndTime() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const refreshEndTime = useCallback(async (streamId: bigint) => {
    if (!addr) throw new Error("DripV4 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "refreshEndTime",
      args: [streamId],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  return { refreshEndTime, isPending: isPending || isConfirming };
}

/**
 * Atomic top-up: pulls `amount` of the stream token from the caller into the
 * vault AND recalculates endTime in a single tx. The caller must first approve
 * the DripV5 contract to spend `amount` of the stream token.
 */
export function useTopUpStream() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const topUp = useCallback(async (streamId: bigint, amount: bigint) => {
    if (!addr) throw new Error("DripV5 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "topUp",
      args: [streamId, amount],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Topping up pulls the token from the wallet into the vault.
  const refetchBalances = useRefetchBalances();
  useEffect(() => { if (isSuccess) refetchBalances(); }, [isSuccess, refetchBalances]);

  return { topUp, isPending: isPending || isConfirming };
}

export function usePauseRecipient() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const pauseRecipient = useCallback(async (streamId: bigint, recipient: `0x${string}`) => {
    if (!addr) throw new Error("DripV4 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "pauseRecipient",
      args: [streamId, recipient],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  return { pauseRecipient, isPending: isPending || isConfirming };
}

export function useResumeRecipient() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const resumeRecipient = useCallback(async (streamId: bigint, recipient: `0x${string}`) => {
    if (!addr) throw new Error("DripV4 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "resumeRecipient",
      args: [streamId, recipient],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  return { resumeRecipient, isPending: isPending || isConfirming };
}

export function useRemoveRecipient() {
  const chainId = useChainId();
  const addr    = useMemo(() => getContractAddress(chainId, "DripV4"), [chainId]);
  const { writeContractAsync, isPending, data: hash } = useWriteContract();

  const removeRecipient = useCallback(async (streamId: bigint, recipient: `0x${string}`) => {
    if (!addr) throw new Error("DripV4 not deployed");
    return writeContractAsync({
      address: addr as `0x${string}`,
      abi: DRIP_V4_ABI,
      functionName: "removeRecipient",
      args: [streamId, recipient],
    });
  }, [addr, writeContractAsync]);

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash });
  return { removeRecipient, isPending: isPending || isConfirming };
}
