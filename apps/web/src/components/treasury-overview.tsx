"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Activity, DollarSign } from "lucide-react";

interface TreasuryOverviewProps {
  activeStreamsCount: number;
  activeSubscriptionsCount: number;
  totalActivePayments: number;
}

export function TreasuryOverview({
  activeStreamsCount,
  activeSubscriptionsCount,
  totalActivePayments,
}: TreasuryOverviewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Active Streams</p>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold">{activeStreamsCount}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Currently active payment streams
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Active Subscriptions</p>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold">{activeSubscriptionsCount}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Currently active subscriptions
          </p>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-muted-foreground">Total Active Payments</p>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold">{totalActivePayments}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Streams + Subscriptions combined
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

