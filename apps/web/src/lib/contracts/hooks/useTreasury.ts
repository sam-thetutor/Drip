"use client";

import { useAccount, useChainId } from "wagmi";
import { useMemo } from "react";
import { formatEther, formatUnits } from "viem";
import { useAllUserStreams } from "./useUserStreams";
import { useUserSubscriptionsAll } from "./useSubscription";
import { getTokenByAddress } from "@/components/token-selector";

/**
 * Hook for aggregating treasury data (streams + subscriptions)
 */
export function useTreasury() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { streams, isLoading: streamsLoading, error: streamsError } = useAllUserStreams(
    address as `0x${string}` | undefined
  );
  const { subscriptions, isLoading: subscriptionsLoading, error: subscriptionsError } =
    useUserSubscriptionsAll(address as `0x${string}` | undefined);

  const isLoading = streamsLoading || subscriptionsLoading;
  const error = streamsError || subscriptionsError;

  // Calculate active streams count
  const activeStreamsCount = useMemo(() => {
    if (!streams || !Array.isArray(streams)) return 0;
    return streams.filter((s: any) => Number(s.status ?? 0) === 0).length;
  }, [streams]);

  // Calculate active subscriptions count
  const activeSubscriptionsCount = useMemo(() => {
    if (!subscriptions || !Array.isArray(subscriptions)) return 0;
    return subscriptions.filter((s: any) => Number(s.status ?? 0) === 0).length;
  }, [subscriptions]);

  // Aggregate balances by token
  const tokenBalances = useMemo(() => {
    const balances: Record<string, { balance: bigint; decimals: number; symbol: string }> = {};

    // Process streams
    // Only count streams where user is the sender (they escrowed the funds)
    if (streams && Array.isArray(streams)) {
      streams.forEach((stream: any) => {
        // Only count streams where user is sender (they own the escrowed funds)
        const isSender = stream.userRole === "sender" || stream.userRole === "both";
        if (!isSender) return; // Skip streams where user is only a recipient
        
        const token = stream.token as string;
        // The stream.deposit field represents the remaining deposit in the stream
        // This is the actual escrowed balance
        const deposit = stream.deposit ? BigInt(stream.deposit) : 0n;
        
        // Only count active or paused streams (completed/cancelled have no escrow)
        const status = Number(stream.status ?? 0);
        if (status !== 0 && status !== 1) return; // 0 = Active, 1 = Paused

        if (!balances[token]) {
          const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId) || {
            decimals: 18,
            symbol: "CELO",
          };
          balances[token] = {
            balance: 0n,
            decimals: tokenInfo.decimals,
            symbol: tokenInfo.symbol,
          };
        }
        balances[token].balance = balances[token].balance + deposit;
      });
    }

    // Process subscriptions (escrow balances)
    if (subscriptions && Array.isArray(subscriptions)) {
      subscriptions.forEach((sub: any) => {
        const token = sub.token as string;
        const balance = sub.balance ? BigInt(sub.balance) : 0n;

        if (!balances[token]) {
          const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId) || {
            decimals: 18,
            symbol: "CELO",
          };
          balances[token] = {
            balance: 0n,
            decimals: tokenInfo.decimals,
            symbol: tokenInfo.symbol,
          };
        }
        balances[token].balance = balances[token].balance + balance;
      });
    }

    return balances;
  }, [streams, subscriptions, chainId]);

  // Calculate total outflow (monthly/yearly projections)
  const outflowProjections = useMemo(() => {
    let monthlyOutflow: Record<string, { amount: number; decimals: number; symbol: string }> = {};
    let yearlyOutflow: Record<string, { amount: number; decimals: number; symbol: string }> = {};

    // Calculate from streams
    if (streams && Array.isArray(streams)) {
      streams.forEach((stream: any) => {
        if (Number(stream.status ?? 0) !== 0) return; // Only active streams

        const token = stream.token as string;
        const periodSeconds = Number(stream.periodSeconds ?? 0);
        const recipients = stream.recipients || [];

        if (periodSeconds === 0) return;

        const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId) || {
          decimals: 18,
          symbol: "CELO",
        };

        // Calculate total amount per period (sum of all recipients)
        let totalAmountPerPeriod = 0n;
        recipients.forEach((recipient: any) => {
          totalAmountPerPeriod += (recipient.amountPerPeriod as bigint) || 0n;
        });

        // Calculate monthly and yearly outflow
        const secondsPerMonth = 30 * 24 * 60 * 60; // Approx 30 days
        const secondsPerYear = 365 * 24 * 60 * 60;

        const monthlyAmount = (totalAmountPerPeriod * BigInt(secondsPerMonth)) / BigInt(periodSeconds);
        const yearlyAmount = (totalAmountPerPeriod * BigInt(secondsPerYear)) / BigInt(periodSeconds);

        if (!monthlyOutflow[token]) {
          monthlyOutflow[token] = {
            amount: 0,
            decimals: tokenInfo.decimals,
            symbol: tokenInfo.symbol,
          };
        }
        if (!yearlyOutflow[token]) {
          yearlyOutflow[token] = {
            amount: 0,
            decimals: tokenInfo.decimals,
            symbol: tokenInfo.symbol,
          };
        }

        monthlyOutflow[token].amount += Number(formatUnits(monthlyAmount, tokenInfo.decimals));
        yearlyOutflow[token].amount += Number(formatUnits(yearlyAmount, tokenInfo.decimals));
      });
    }

    // Calculate from subscriptions
    if (subscriptions && Array.isArray(subscriptions)) {
      subscriptions.forEach((sub: any) => {
        if (Number(sub.status ?? 0) !== 0) return; // Only active subscriptions

        const token = sub.token as string;
        const amount = sub.amount as bigint;
        const cadence = Number(sub.cadence ?? 0);
        const interval = Number(sub.interval ?? 0);

        const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId) || {
          decimals: 18,
          symbol: "CELO",
        };

        let paymentsPerMonth = 0;
        let paymentsPerYear = 0;

        switch (cadence) {
          case 0: // Daily
            paymentsPerMonth = 30;
            paymentsPerYear = 365;
            break;
          case 1: // Weekly
            paymentsPerMonth = 4.33;
            paymentsPerYear = 52;
            break;
          case 2: // Monthly
            paymentsPerMonth = 1;
            paymentsPerYear = 12;
            break;
          case 3: // Custom
            if (interval > 0) {
              const secondsPerMonth = 30 * 24 * 60 * 60;
              const secondsPerYear = 365 * 24 * 60 * 60;
              paymentsPerMonth = secondsPerMonth / interval;
              paymentsPerYear = secondsPerYear / interval;
            }
            break;
        }

        const amountPerPayment = Number(formatUnits(amount, tokenInfo.decimals));
        const monthlyAmount = amountPerPayment * paymentsPerMonth;
        const yearlyAmount = amountPerPayment * paymentsPerYear;

        if (!monthlyOutflow[token]) {
          monthlyOutflow[token] = {
            amount: 0,
            decimals: tokenInfo.decimals,
            symbol: tokenInfo.symbol,
          };
        }
        if (!yearlyOutflow[token]) {
          yearlyOutflow[token] = {
            amount: 0,
            decimals: tokenInfo.decimals,
            symbol: tokenInfo.symbol,
          };
        }

        monthlyOutflow[token].amount += monthlyAmount;
        yearlyOutflow[token].amount += yearlyAmount;
      });
    }

    return { monthly: monthlyOutflow, yearly: yearlyOutflow };
  }, [streams, subscriptions, chainId]);

  // Calculate financial analytics
  const analytics = useMemo(() => {
    const totalOutflow = { ...outflowProjections.monthly };
    const activePayments = activeStreamsCount + activeSubscriptionsCount;

    // Calculate average payment amounts
    const avgStreamAmount: Record<string, { amount: number; count: number }> = {};
    const avgSubscriptionAmount: Record<string, { amount: number; count: number }> = {};

    if (streams && Array.isArray(streams)) {
      streams.forEach((stream: any) => {
        if (Number(stream.status ?? 0) !== 0) return;
        const token = stream.token as string;
        const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId) || {
          decimals: 18,
          symbol: "CELO",
        };
        const recipients = stream.recipients || [];
        recipients.forEach((recipient: any) => {
          const amount = Number(
            formatUnits(recipient.amountPerPeriod as bigint, tokenInfo.decimals)
          );
          if (!avgStreamAmount[token]) {
            avgStreamAmount[token] = { amount: 0, count: 0 };
          }
          avgStreamAmount[token].amount += amount;
          avgStreamAmount[token].count += 1;
        });
      });
    }

    if (subscriptions && Array.isArray(subscriptions)) {
      subscriptions.forEach((sub: any) => {
        if (Number(sub.status ?? 0) !== 0) return;
        const token = sub.token as string;
        const tokenInfo = getTokenByAddress(token as `0x${string}`, chainId) || {
          decimals: 18,
          symbol: "CELO",
        };
        const amount = Number(formatUnits(sub.amount as bigint, tokenInfo.decimals));
        if (!avgSubscriptionAmount[token]) {
          avgSubscriptionAmount[token] = { amount: 0, count: 0 };
        }
        avgSubscriptionAmount[token].amount += amount;
        avgSubscriptionAmount[token].count += 1;
      });
    }

    const avgAmounts: Record<string, number> = {};
    Object.keys(avgStreamAmount).forEach((token) => {
      const stream = avgStreamAmount[token];
      const sub = avgSubscriptionAmount[token] || { amount: 0, count: 0 };
      const totalAmount = stream.amount + sub.amount;
      const totalCount = stream.count + sub.count;
      if (totalCount > 0) {
        avgAmounts[token] = totalAmount / totalCount;
      }
    });
    Object.keys(avgSubscriptionAmount).forEach((token) => {
      if (!avgAmounts[token]) {
        const sub = avgSubscriptionAmount[token];
        if (sub.count > 0) {
          avgAmounts[token] = sub.amount / sub.count;
        }
      }
    });

    return {
      totalOutflow,
      activePayments,
      avgAmounts,
    };
  }, [streams, subscriptions, activeStreamsCount, activeSubscriptionsCount, outflowProjections, chainId]);

  return {
    streams,
    subscriptions,
    activeStreamsCount,
    activeSubscriptionsCount,
    tokenBalances,
    outflowProjections,
    analytics,
    isLoading,
    error,
  };
}

