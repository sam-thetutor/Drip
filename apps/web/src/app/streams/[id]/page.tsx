"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { StreamDetailsView } from "@/components/stream-details-view";

export default function StreamDetailsPage() {
  const params   = useParams();
  const streamId = params?.id ? BigInt(params.id as string) : undefined;

  if (!streamId) {
    return (
      <main className="flex-1">
        <div className="container px-4 mx-auto max-w-[1280px] py-8">
          <div className="text-center py-12 space-y-4">
            <p className="text-muted-foreground">Invalid plan ID</p>
            <Button asChild variant="outline">
              <Link href="/streams">Back to plans</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="container px-4 mx-auto max-w-[1280px] py-8">
        <div className="mb-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/streams">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to plans
            </Link>
          </Button>
        </div>

        <StreamDetailsView streamId={streamId} />
      </div>
    </main>
  );
}
