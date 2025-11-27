"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, BarChart3, DollarSign } from "lucide-react";

interface FinancialAnalyticsProps {
  outflowProjections: {
    monthly: Record<string, { amount: number; decimals: number; symbol: string }>;
    yearly: Record<string, { amount: number; decimals: number; symbol: string }>;
  };
  analytics: {
    totalOutflow: Record<string, { amount: number; decimals: number; symbol: string }>;
    activePayments: number;
    avgAmounts: Record<string, number>;
  };
}

export function FinancialAnalytics({
  outflowProjections,
  analytics,
}: FinancialAnalyticsProps) {
  const monthlyTokens = Object.entries(outflowProjections.monthly);
  const yearlyTokens = Object.entries(outflowProjections.yearly);
  const avgTokens = Object.entries(analytics.avgAmounts);

  return (
    <div className="space-y-6">
      {/* Outflow Projections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Outflow */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Estimated Monthly Outflow
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Projected monthly spending across all active payments
            </p>
          </CardHeader>
          <CardContent>
            {monthlyTokens.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No active payments to project
              </p>
            ) : (
              <div className="space-y-3">
                {monthlyTokens.map(([token, { amount, symbol }]) => (
                  <div
                    key={token}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background/50"
                  >
                    <span className="font-medium">{symbol}</span>
                    <span className="text-lg font-bold">
                      {amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 4,
                      })}{" "}
                      {symbol}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Yearly Outflow */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Estimated Yearly Outflow
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Projected yearly spending across all active payments
            </p>
          </CardHeader>
          <CardContent>
            {yearlyTokens.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No active payments to project
              </p>
            ) : (
              <div className="space-y-3">
                {yearlyTokens.map(([token, { amount, symbol }]) => (
                  <div
                    key={token}
                    className="flex items-center justify-between p-3 rounded-lg border bg-background/50"
                  >
                    <span className="font-medium">{symbol}</span>
                    <span className="text-lg font-bold">
                      {amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      {symbol}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Average Payment Amounts */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Average Payment Amounts
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Average payment amount per active stream/subscription by token
          </p>
        </CardHeader>
        <CardContent>
          {avgTokens.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No payment data available
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {avgTokens.map(([token, amount]) => {
                // Get symbol from monthly outflow (they should have same tokens)
                const tokenData = outflowProjections.monthly[token];
                const symbol = tokenData?.symbol || "Token";

                return (
                  <div
                    key={token}
                    className="p-4 rounded-lg border bg-background/50 backdrop-blur-sm"
                  >
                    <p className="text-sm text-muted-foreground mb-1">{symbol}</p>
                    <p className="text-2xl font-bold">
                      {amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Average per payment</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

