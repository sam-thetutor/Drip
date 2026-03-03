"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Loader2, Plus, List } from "lucide-react";
import { SuperfluidDashboard } from "@/components/superfluid-dashboard";
import { CreateSuperfluidStreamForm } from "@/components/create-superfluid-stream-form";

export default function CreateStreamPage() {
  const [activeTab, setActiveTab] = useState("create");

  return (
    <main className="flex-1">
      <div className="container px-4 mx-auto max-w-[1280px] py-8">
        {/* Header */}
        <div className="mb-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-2">Superfluid Streams</h1>
          <p className="text-muted-foreground">
            Create and manage your GDA pool-based payment streams
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Stream
            </TabsTrigger>
            <TabsTrigger value="view" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Your Streams
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
              <CreateSuperfluidStreamForm />
            </Suspense>
          </TabsContent>

          <TabsContent value="view" className="space-y-4">
            <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
              <SuperfluidDashboard />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

