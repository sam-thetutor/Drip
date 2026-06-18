"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { CreateStreamForm } from "@/components/create-stream-form";

export default function CreateStreamPage() {
  return (
    <main className="flex-1">
      <div className="page-container py-8">
        {/* Header */}
        <div className="mb-8">
          <Button asChild variant="ghost" className="mb-4 -ml-2">
            <Link href="/streams">
              <ArrowLeft className="h-4 w-4 mr-2" />
              My plans
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-1">Set up a money plan</h1>
          <p className="text-muted-foreground text-sm">
            Choose where your money should go and how much each bucket gets. Drip streams it out for you and stops automatically when the plan is done.
          </p>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <CreateStreamForm />
        </Suspense>
      </div>
    </main>
  );
}
