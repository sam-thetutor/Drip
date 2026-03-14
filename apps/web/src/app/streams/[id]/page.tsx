"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { StreamDetailsView } from "@/components/stream-details-view";
import { SuperfluidStreamDetailsView } from "@/components/superfluid-stream-details-view";
import { useStream, useSuperfluidStreamData } from "@/lib/contracts";
import { useAccount } from "wagmi";

export default function StreamDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const streamId = params?.id ? BigInt(params.id as string) : undefined;

  // Try to load from both contracts to determine which one it belongs to
  const { stream: regularStream, isLoading: regularLoading } = useStream(streamId!);
  const { streamData: superfluidStream, isLoading: superfluidLoading } = useSuperfluidStreamData(streamId, address);

  if (!streamId) {
    return (
      <main className="flex-1">
        <div className="container px-4 mx-auto max-w-[1280px] py-8">
          <div className="text-center py-12">
            <p className="text-muted-foreground">Invalid stream ID</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/streams/create">Back to Streams</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // Determine which type of stream it is
  const isSuperfluid = superfluidStream && !superfluidLoading;
  const isRegular = regularStream && !regularLoading && !isSuperfluid;

  return (
    <main className="flex-1">
      <div className="container px-4 mx-auto max-w-[1280px] py-8">
        <div className="mb-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/streams/create">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Streams
            </Link>
          </Button>
        </div>

        {isSuperfluid ? (
          <SuperfluidStreamDetailsView streamId={streamId} />
        ) : (
          <StreamDetailsView streamId={streamId} />
        )}
      </div>
    </main>
  );
}

