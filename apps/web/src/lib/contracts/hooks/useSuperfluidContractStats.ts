"use client";

import { useQuery } from "@tanstack/react-query";
import { useChainId } from "wagmi";
import { getContractAddress, CELO_MAINNET_ID } from "@/lib/contracts/config";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";

type AccountTokenSnapshot = {
  totalAmountStreamedOutUntilUpdatedAt: string;
  totalOutflowRate: string;
  updatedAtTimestamp: string;
  activeOutgoingStreamCount?: number;
  inactiveOutgoingStreamCount?: number;
  totalNumberOfActiveStreams: number;
  totalNumberOfClosedStreams: number;
};

type HeroStreamStats = {
  streamsCreated: number;
  streamedValueWei: bigint;
  outflowRateWeiPerSecond: bigint;
  lastUpdatedTimestampSec: number;
};

const SUBGRAPH_ENDPOINTS: Partial<Record<number, string>> = {
  [CELO_MAINNET_ID]: "https://subgraph-endpoints.superfluid.dev/celo-mainnet/protocol-v1",
};

const SNAPSHOT_QUERY_WITH_OUTGOING_COUNTS = `
  query ContractSnapshot($account: String!, $token: String!) {
    accountTokenSnapshots(first: 1, where: { account: $account, token: $token }) {
      totalAmountStreamedOutUntilUpdatedAt
      totalOutflowRate
      updatedAtTimestamp
      activeOutgoingStreamCount
      inactiveOutgoingStreamCount
      totalNumberOfActiveStreams
      totalNumberOfClosedStreams
    }
  }
`;

const SNAPSHOT_QUERY_FALLBACK = `
  query ContractSnapshot($account: String!, $token: String!) {
    accountTokenSnapshots(first: 1, where: { account: $account, token: $token }) {
      totalAmountStreamedOutUntilUpdatedAt
      totalOutflowRate
      updatedAtTimestamp
      totalNumberOfActiveStreams
      totalNumberOfClosedStreams
    }
  }
`;

async function fetchSnapshot(
  endpoint: string,
  query: string,
  account: `0x${string}`,
  token: `0x${string}`
): Promise<AccountTokenSnapshot | null> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        account: account.toLowerCase(),
        token: token.toLowerCase(),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Superfluid subgraph request failed: ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: { accountTokenSnapshots?: AccountTokenSnapshot[] };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    const message = payload.errors.map((error) => error.message || "GraphQL error").join("; ");
    throw new Error(message);
  }

  const [snapshot] = payload.data?.accountTokenSnapshots || [];
  return snapshot || null;
}

function toBigIntSafe(value?: string): bigint {
  if (!value) return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function computeLiveStreamedValue(snapshot: AccountTokenSnapshot): bigint {
  const base = toBigIntSafe(snapshot.totalAmountStreamedOutUntilUpdatedAt);
  const outflowRate = toBigIntSafe(snapshot.totalOutflowRate);
  const lastUpdated = Number(snapshot.updatedAtTimestamp || 0);

  if (outflowRate <= 0n || !Number.isFinite(lastUpdated) || lastUpdated <= 0) {
    return base;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const elapsed = nowSec - lastUpdated;
  if (elapsed <= 0) {
    return base;
  }

  return base + outflowRate * BigInt(elapsed);
}

function computeStreamsCreated(snapshot: AccountTokenSnapshot): number {
  const outgoingCount =
    (snapshot.activeOutgoingStreamCount ?? 0) + (snapshot.inactiveOutgoingStreamCount ?? 0);

  if (outgoingCount > 0) {
    return outgoingCount;
  }

  return (snapshot.totalNumberOfActiveStreams || 0) + (snapshot.totalNumberOfClosedStreams || 0);
}

export function useSuperfluidContractStats() {
  const chainId = useChainId();
  const endpoint = SUBGRAPH_ENDPOINTS[chainId];
  const contractAddress = getContractAddress(chainId, "DripCoreSuperfluid");
  const gDollarAddress = getTokenAddressBySymbol("G$", chainId);

  return useQuery<HeroStreamStats>({
    queryKey: ["superfluid-contract-hero-stats", chainId, contractAddress, gDollarAddress],
    enabled: Boolean(endpoint && contractAddress && gDollarAddress),
    refetchInterval: 30_000,
    queryFn: async () => {
      if (!endpoint || !contractAddress || !gDollarAddress) {
        return {
          streamsCreated: 0,
          streamedValueWei: 0n,
          outflowRateWeiPerSecond: 0n,
          lastUpdatedTimestampSec: 0,
        };
      }

      let snapshot: AccountTokenSnapshot | null = null;
      try {
        snapshot = await fetchSnapshot(
          endpoint,
          SNAPSHOT_QUERY_WITH_OUTGOING_COUNTS,
          contractAddress,
          gDollarAddress
        );
      } catch {
        // Backward compatibility for chains/subgraph versions missing outgoing counters.
        snapshot = await fetchSnapshot(
          endpoint,
          SNAPSHOT_QUERY_FALLBACK,
          contractAddress,
          gDollarAddress
        );
      }

      if (!snapshot) {
        return {
          streamsCreated: 0,
          streamedValueWei: 0n,
          outflowRateWeiPerSecond: 0n,
          lastUpdatedTimestampSec: 0,
        };
      }

      return {
        streamsCreated: computeStreamsCreated(snapshot),
        streamedValueWei: computeLiveStreamedValue(snapshot),
        outflowRateWeiPerSecond: toBigIntSafe(snapshot.totalOutflowRate),
        lastUpdatedTimestampSec: Number(snapshot.updatedAtTimestamp || 0),
      };
    },
  });
}
