"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1 relative overflow-hidden min-h-[calc(100vh-4rem)]">
      {/* Floating Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Top Left - Purple Circle */}
        <div className="absolute top-20 left-10 w-24 h-24 bg-purple-500/20 rounded-full blur-2xl animate-pulse"></div>
        
        {/* Top Right - Orange Circle */}
        <div className="absolute top-20 right-10 w-24 h-24 bg-orange-500/20 rounded-full blur-2xl animate-pulse delay-1000"></div>
        
        {/* Bottom Left - Green Circle */}
        <div className="absolute bottom-20 left-10 w-24 h-24 bg-green/20 rounded-full blur-2xl animate-pulse delay-500"></div>
        
        {/* Bottom Right - Green Circle */}
        <div className="absolute bottom-20 right-10 w-24 h-24 bg-green/20 rounded-full blur-2xl animate-pulse delay-700"></div>
      </div>

      {/* Hero Section - Centered Layout */}
      <section className="relative z-10 flex items-center justify-center min-h-[calc(100vh-4rem)] py-20">
        <div className="container px-4 mx-auto max-w-4xl text-center">
          {/* Main Headline - Large, Green, Centered */}
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            <span className="text-green">Stream Payments</span> With Confidence
          </h1>
          
          {/* Tagline/Description - White Text */}
          <p className="text-lg md:text-xl text-foreground/90 mb-10 max-w-2xl mx-auto leading-relaxed">
            Automate continuous payments with smart contracts. Stream funds in real-time or set up recurring subscriptions on Celo.
          </p>

          {/* CTA Buttons - Centered, Two Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {/* Primary Button - Solid Green */}
            <Button
              size="lg"
              className="px-8 py-6 text-base font-semibold bg-green text-white rounded-lg hover:bg-green-dark transition-all duration-300 shadow-lg shadow-green/20"
              asChild
            >
              <Link href="/streams/create" className="flex items-center gap-2">
                Get Started
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
            
            {/* Secondary Button - Dark with Green Border */}
            <Button
              size="lg"
              variant="outline"
              className="px-8 py-6 text-base font-semibold rounded-lg border-2 border-green text-foreground bg-background hover:bg-green/10 hover:border-green transition-all duration-300"
              asChild
            >
              <Link href="/streams" className="flex items-center gap-2">
                Start Streaming
                <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
