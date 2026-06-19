"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { StreamsDashboard } from "@/components/streams-dashboard";
import { StreamsAnalyticsDashboard } from "@/components/streams-analytics-dashboard";
import { StreamActivityFeed } from "@/components/stream-activity-feed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "wagmi";
import { useUserSubscriptionsAll } from "@/lib/contracts";
import { SubscriptionCard } from "@/components/subscription-card";

function SubscriptionsTab() {
  const { address, isConnected } = useAccount();
  const { subscriptions, isLoading, error } = useUserSubscriptionsAll(
    address as `0x${string}` | undefined
  );

  const hasSubscriptions = Array.isArray(subscriptions) && subscriptions.length > 0;

  if (!isConnected || !address) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <p className="text-muted-foreground">Connect your wallet to view your bills.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <p className="text-destructive text-sm">Error: {error.message}</p>
      </div>
    );
  }

  if (!hasSubscriptions) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center space-y-4">
        <p className="text-foreground/50 text-sm">No bills set up yet.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/subscriptions/create">Set up your first bill</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {subscriptions.map((sub: any) => (
        <Link
          key={Number(sub.subscriptionId)}
          href={`/subscriptions/${Number(sub.subscriptionId)}`}
          className="block"
        >
          <SubscriptionCard
            subscriptionId={BigInt(sub.subscriptionId)}
            amount={BigInt(sub.amount)}
            token={sub.token}
            title={sub.title}
          />
        </Link>
      ))}
    </div>
  );
}

const LoadingFallback = (
  <div className="space-y-2 pt-2">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
    ))}
  </div>
);

export default function StreamsPage() {
  return (
    <main className="flex-1">
      <div className="page-container py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Your plans</h1>
            <p className="text-sm text-foreground/50 mt-0.5">
              Your money buckets, bills &amp; insights
            </p>
          </div>
          <Button asChild className="hero-cta-button">
            <Link href="/streams/create" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Set up a plan
            </Link>
          </Button>
        </div>

        <Tabs defaultValue="streams" className="w-full">
          <TabsList className="mb-5 bg-white/5 border border-white/10 rounded-xl p-1 w-auto inline-flex">
            <TabsTrigger value="streams"       className="rounded-lg data-[state=active]:bg-green/20 data-[state=active]:text-green px-4">Plans</TabsTrigger>
            <TabsTrigger value="subscriptions" className="rounded-lg data-[state=active]:bg-green/20 data-[state=active]:text-green px-4">Bills</TabsTrigger>
            <TabsTrigger value="activity"      className="rounded-lg data-[state=active]:bg-green/20 data-[state=active]:text-green px-4">Activity</TabsTrigger>
            <TabsTrigger value="analytics"     className="rounded-lg data-[state=active]:bg-green/20 data-[state=active]:text-green px-4">Insights</TabsTrigger>
          </TabsList>

          <TabsContent value="streams">
            <Suspense fallback={LoadingFallback}>
              <StreamsDashboard />
            </Suspense>
          </TabsContent>

          <TabsContent value="subscriptions">
            <Suspense fallback={LoadingFallback}>
              <SubscriptionsTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="activity">
            <Suspense fallback={LoadingFallback}>
              <StreamActivityFeed />
            </Suspense>
          </TabsContent>

          <TabsContent value="analytics">
            <Suspense fallback={
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            }>
              <StreamsAnalyticsDashboard />
            </Suspense>
          </TabsContent>
        </Tabs>

      </div>
    </main>
  );
}
