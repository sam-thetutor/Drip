"use client";

import Link from "next/link";
import { Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function StakePage() {
  return (
    <main className="min-h-screen">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <Card className="glass-card border-white/15">
          <CardContent className="py-16 text-center">
            <Lock className="mx-auto mb-4 h-12 w-12 text-foreground/50" />
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-foreground/60">
              Staking
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              Staking is temporarily disabled
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm text-foreground/70">
              Staking actions are currently unavailable in the UI. Stream and wallet features remain active.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button className="hero-cta-button" asChild>
                <Link href="/dashboard" className="flex items-center gap-2">
                  Open dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="outline" className="hero-cta-outline" asChild>
                <Link href="/wallet">Go to wallet</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
