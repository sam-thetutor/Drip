import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CreateSubscriptionForm } from "@/components/create-subscription-form";

export default function CreateSubscriptionPage() {
  return (
    <main className="flex-1">
      <div className="container px-4 mx-auto max-w-[1280px] py-8">
        {/* Header */}
        <div className="mb-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/subscriptions">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to bills
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-2">Set up a bill</h1>
          <p className="text-muted-foreground">
            Schedule a recurring payment that runs itself — set it once and forget it
          </p>
        </div>

        <CreateSubscriptionForm />
      </div>
    </main>
  );
}

