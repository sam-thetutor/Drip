"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Coins, TrendingUp, Calendar } from "lucide-react";

interface UbiMetrics {
  totalClaims: number;
  uniqueClaimers: number;
  totalAmountClaimed: string;
  claimsToday: number;
  claimsThisWeek: number;
  claimsThisMonth: number;
  averageClaimAmount: string;
}

interface UbiMetricsCardsProps {
  metrics: UbiMetrics | null;
  loading: boolean;
}

export function UbiMetricsCards({ metrics, loading }: UbiMetricsCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="glass-card">
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted/30 rounded animate-pulse" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted/30 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load metrics
      </div>
    );
  }

  const cards = [
    {
      title: "Total Claims",
      value: metrics.totalClaims.toLocaleString(),
      icon: Coins,
      color: "text-green",
    },
    {
      title: "Unique Claimers",
      value: metrics.uniqueClaimers.toLocaleString(),
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "Total G$ Claimed",
      value: parseFloat(metrics.totalAmountClaimed).toFixed(2),
      icon: TrendingUp,
      color: "text-purple-500",
    },
    {
      title: "Claims Today",
      value: metrics.claimsToday.toLocaleString(),
      icon: Calendar,
      color: "text-orange-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
