import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function SubscriptionsPage() {
  return (
    <main className="flex-1">
      <div className="container px-4 mx-auto max-w-[1280px] py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Subscriptions</h1>
            <p className="text-muted-foreground">
              Manage your recurring payment subscriptions
            </p>
          </div>
          <Button asChild>
            <Link href="/subscriptions/create">
              <Plus className="h-4 w-4 mr-2" />
              Create Subscription
            </Link>
          </Button>
        </div>

        {/* Subscriptions List */}
        <div className="space-y-4">
          <div className="text-center py-12 border rounded-lg">
            <p className="text-muted-foreground">No subscriptions yet</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/subscriptions/create">Create your first subscription</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

