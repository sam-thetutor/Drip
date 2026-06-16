"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { StreamsDashboard } from "@/components/streams-dashboard";

export default function StreamsPage() {
  return (
    <main className="flex-1">
      <div className="page-container py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">My Streams</h1>
            <p className="text-muted-foreground text-sm">
              All your active, paused, and past payment streams
            </p>
          </div>
          <Button asChild>
            <Link href="/streams/create">
              <Plus className="h-4 w-4 mr-2" />
              New Stream
            </Link>
          </Button>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <StreamsDashboard />
        </Suspense>
      </div>
    </main>
  );
}
