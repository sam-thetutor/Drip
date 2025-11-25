"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserBalance } from "@/components/user-balance";
import { Zap, ArrowRight, Sparkles } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1 relative overflow-hidden">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 z-10 fade-in">
        <div className="container px-4 mx-auto max-w-7xl">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge - Clean Minimalist */}
           

            {/* Main Heading - Solid Color */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6">
              <span className="text-indigo">Drip</span>
            </h1>

            {/* Tagline - Clean Typography */}
            <p className="text-2xl md:text-4xl lg:text-5xl font-semibold mb-6 text-foreground">
              Programmable Payments,{" "}
              <span className="text-indigo">Autonomous Execution</span>
            </p>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              Real-time payment streaming and recurring subscriptions on Celo. 
              Automate continuous payouts with smart contracts.
            </p>

            {/* User Balance Display - Minimalist Card */}
            {/* <div className="mb-12">
              <div className="glass-card rounded-2xl p-6 max-w-md mx-auto border border-indigo/20 hover-lift">
                <UserBalance />
              </div>
            </div> */}

            {/* CTA Buttons - Clean Solid Colors */}
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-16">
              <Button
                size="lg"
                className="px-10 py-6 text-base font-semibold bg-indigo text-white rounded-xl hover-lift hover:bg-indigo-dark transition-all duration-300 group"
                asChild
              >
                <Link href="/streams/create" className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Create Stream
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              
              <Button
                size="lg"
                variant="outline"
                className="px-10 py-6 text-base font-semibold rounded-xl border-2 border-indigo/50 text-indigo bg-transparent hover:bg-indigo/10 hover:border-indigo hover-lift transition-all duration-300"
                asChild
              >
                <Link href="/subscriptions/create" className="flex items-center gap-2">
                  Create Subscription
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
            </div>

            {/* Feature Pills - Minimalist */}
            <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
              <div className="glass-card px-4 py-2 rounded-full border border-indigo/20 hover-lift">
                <span className="text-sm text-muted-foreground">⚡ Real-time Streaming</span>
              </div>
              <div className="glass-card px-4 py-2 rounded-full border border-purple/20 hover-lift">
                <span className="text-sm text-muted-foreground">🔄 Auto Payments</span>
              </div>
              <div className="glass-card px-4 py-2 rounded-full border border-indigo/20 hover-lift">
                <span className="text-sm text-muted-foreground">🔒 Smart Contracts</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Minimal Decorative Line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-border/50"></div>
    </main>
  );
}
