"use client";

import { useAccount } from "wagmi";
import { useTreasury } from "@/lib/contracts/hooks/useTreasury";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart3, Settings } from "lucide-react";
import { formatUnits } from "viem";
import { TreasuryOverview } from "@/components/treasury-overview";
import { TokenBalances } from "@/components/token-balances";
import { FinancialAnalytics } from "@/components/financial-analytics";
import { BulkStreamCreation } from "@/components/bulk-stream-creation";
import { BatchSubscriptionManagement } from "@/components/batch-subscription-management";
import { ExportData } from "@/components/export-data";
import { TreasuryActivityLog } from "@/components/treasury-activity-log";
import { BudgetControls } from "@/components/budget-controls";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TreasuryPage() {
  const { address, isConnected } = useAccount();
  const {
    activeStreamsCount,
    activeSubscriptionsCount,
    tokenBalances,
    outflowProjections,
    analytics,
    isLoading,
    error,
  } = useTreasury();

  if (!isConnected || !address) {
    return (
      <main className="flex-1">
        <div className="container px-4 mx-auto max-w-[1280px] py-8">
          <div className="glass-card rounded-lg p-8 text-center">
            <p className="text-muted-foreground">
              Connect your wallet to view your treasury dashboard.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="flex-1">
        <div className="container px-4 mx-auto max-w-[1280px] py-8">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading treasury data...</span>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1">
        <div className="container px-4 mx-auto max-w-[1280px] py-8">
          <div className="glass-card rounded-lg p-8 text-center">
            <p className="text-destructive">
              Error loading treasury data: {error.message}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="container px-4 mx-auto max-w-[1280px] py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Treasury</h1>
          <p className="text-muted-foreground">
            Manage your payment streams and subscriptions
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="management" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Management
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6 mt-6">
            {/* Overview Cards */}
            <TreasuryOverview
              activeStreamsCount={activeStreamsCount}
              activeSubscriptionsCount={activeSubscriptionsCount}
              totalActivePayments={analytics.activePayments}
            />

            {/* Token Balances */}
            <TokenBalances tokenBalances={tokenBalances} />

            {/* Financial Analytics */}
            <FinancialAnalytics
              outflowProjections={outflowProjections}
              analytics={analytics}
            />
          </TabsContent>

          {/* Management Tab */}
          <TabsContent value="management" className="space-y-6 mt-6">
            {/* Bulk Operations */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <BulkStreamCreation />
              <BatchSubscriptionManagement />
            </div>

            {/* Export & Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ExportData />
              <TreasuryActivityLog />
            </div>

            {/* Budget Controls */}
            <BudgetControls />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

