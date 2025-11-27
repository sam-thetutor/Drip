"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";
import { formatUnits } from "viem";

interface TokenBalancesProps {
  tokenBalances: Record<
    string,
    { balance: bigint; decimals: number; symbol: string }
  >;
}

export function TokenBalances({ tokenBalances }: TokenBalancesProps) {
  const tokens = Object.entries(tokenBalances);

  if (tokens.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Token Balances
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            No token balances found
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Token Balances (Escrowed Funds)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Total balances across all streams and subscriptions
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {tokens.map(([address, { balance, decimals, symbol }]) => {
            const formattedBalance = formatUnits(balance, decimals);
            const displayBalance = parseFloat(formattedBalance).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 6,
            });

            return (
              <div
                key={address}
                className="p-4 rounded-lg border bg-background/50 backdrop-blur-sm"
              >
                <p className="text-sm text-muted-foreground mb-1">{symbol}</p>
                <p className="text-2xl font-bold">{displayBalance}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {address === "0x0000000000000000000000000000000000000000"
                    ? "Native CELO"
                    : `${address.slice(0, 6)}...${address.slice(-4)}`}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

