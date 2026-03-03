"use client";

import { useAccount } from "wagmi";
import { useSuperfluidStreams } from "@/lib/contracts";
import { SuperfluidStreamCard } from "@/components/superfluid-stream-card";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Droplets } from "lucide-react";

export function SuperfluidDashboard() {
  const { address, isConnected } = useAccount();
  const { streamIds, isLoading, error } = useSuperfluidStreams(address);

  if (!isConnected || !address) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Please connect your wallet to view your Superfluid streams
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading streams...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="glass-card">
        <CardContent className="pt-6">
          <p className="text-center text-destructive">
            Error loading streams: {error.message || "Unknown error"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasStreams = streamIds && streamIds.length > 0;

  if (!hasStreams) {
    return (
      <Card className="glass-card">
        <CardContent className="py-12 text-center">
          <Droplets className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground mb-2 font-medium">No Superfluid streams yet</p>
          <p className="text-sm text-muted-foreground">
            You'll see your GDA pool streams here when you start receiving them
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-6">
        <Droplets className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Your Superfluid Streams</h2>
        <span className="ml-auto text-sm text-muted-foreground">
          {streamIds.length} stream{streamIds.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {streamIds.map((id) => (
          <SuperfluidStreamCard key={id.toString()} streamId={id} />
        ))}
      </div>
    </div>
  );
}
