"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * wagmi v2 stores read results under query keys whose first element is the
 * action name. These are the ones that reflect on-chain token balances /
 * allowances, so invalidating them forces an immediate refetch.
 */
const BALANCE_QUERY_KEYS = new Set([
  "balance", // useBalance (native + ERC20)
  "readContract", // useReadContract — e.g. ERC20 balanceOf / allowance
  "readContracts", // useReadContracts — batched balanceOf
  "token", // useToken
]);

/**
 * Returns a function that immediately refetches every wallet token balance
 * (and ERC20 allowance) currently observed anywhere in the app.
 *
 * Call it right after any action that alters the wallet's balances — creating a
 * stream, swapping, topping up, withdrawing, off-ramping, etc. — so the UI
 * reflects the new balances without waiting for the next poll or a manual
 * refresh.
 */
export function useRefetchBalances() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = Array.isArray(query.queryKey) ? query.queryKey[0] : undefined;
        return typeof key === "string" && BALANCE_QUERY_KEYS.has(key);
      },
    });
  }, [queryClient]);
}
