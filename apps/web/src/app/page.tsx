"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Droplet, Zap, Shield, Clock } from "lucide-react";

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
        <div className="container px-4 mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Text Content */}
            <div className="text-center lg:text-left space-y-8">
              {/* Main Headline with Drip Icon */}
              <div className="space-y-4">
                <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
                  <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
                    <span className="text-green">Drip Payments</span>
                    <br />
                    Like Water
                  </h1>
                </div>
                
                {/* Tagline/Description */}
                <p className="text-xl md:text-2xl text-foreground/90 leading-relaxed">
                  Continuous, automatic payments that{" "}
                  <span className="text-green font-semibold">flow steadily</span> over time.
                </p>
              </div>

              {/* Key Benefits */}
              {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-6">
                <div className="flex flex-col items-center lg:items-start gap-2">
                  <Clock className="h-6 w-6 text-green" />
                  <span className="text-sm text-foreground/80">24/7 Automated</span>
                </div>
                <div className="flex flex-col items-center lg:items-start gap-2">
                  <Shield className="h-6 w-6 text-green" />
                  <span className="text-sm text-foreground/80">Smart Contract</span>
                </div>
                <div className="flex flex-col items-center lg:items-start gap-2">
                  <Zap className="h-6 w-6 text-green" />
                  <span className="text-sm text-foreground/80">Instant & Secure</span>
                </div>
              </div> */}

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button
                  size="lg"
                  className="px-8 py-6 text-base font-semibold bg-green text-white rounded-lg hover:bg-green-dark transition-all duration-300 shadow-lg shadow-green/20"
                  asChild
                >
                  <Link href="/streams/create" className="flex items-center gap-2">
                    Start Dripping
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                
                <Button
                  size="lg"
                  variant="outline"
                  className="px-8 py-6 text-base font-semibold rounded-lg border-2 border-green text-foreground bg-background hover:bg-green/10 hover:border-green transition-all duration-300"
                  asChild
                >
                  <Link href="/streams" className="flex items-center gap-2">
                    View Streams
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
              </div>
            </div>

            {/* Right Column - Dripping Animation Visualization */}
            <div className="relative h-[500px] flex items-center justify-center">
              {/* Dripping Animation Container */}
              <div className="relative w-full max-w-md h-full">
                {/* Source Container (Top) */}
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-20 bg-gradient-to-b from-green/30 to-green/10 rounded-t-lg border-2 border-green/50 flex items-center justify-center">
                  <div className="text-center">
                    <Droplet className="h-8 w-8 text-green mx-auto mb-1 animate-pulse" />
                    <span className="text-xs text-green font-semibold">Funds Pool</span>
                  </div>
                </div>

                {/* Dripping Drops Animation */}
                <div className="absolute top-20 left-1/2 transform -translate-x-1/2 w-full h-[350px] overflow-hidden">
                  {/* Multiple dripping streams */}
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute animate-drip"
                      style={{
                        left: `${20 + i * 15}%`,
                        animationDuration: `${2 + i * 0.5}s`,
                        animationDelay: `${i * 0.3}s`,
                      }}
                    >
                      <div className="w-3 h-8 bg-gradient-to-b from-green to-green/50 rounded-full blur-[1px]"></div>
                    </div>
                  ))}
                </div>

                {/* Recipient Containers (Bottom) */}
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-full flex justify-around">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-24 h-20 bg-gradient-to-t from-green/30 to-green/10 rounded-b-lg border-2 border-green/50 flex items-center justify-center relative overflow-hidden animate-fill"
                      style={{
                        animationDuration: `${3 + i * 0.5}s`,
                        animationDelay: `${1 + i * 0.5}s`,
                      }}
                    >
                      <div className="absolute bottom-0 left-0 right-0 bg-green/40 rounded-b-lg" style={{ height: `${30 + i * 20}%` }}></div>
                      <Droplet className="h-6 w-6 text-green relative z-10" />
                    </div>
                  ))}
                </div>

                {/* Flow Lines */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
                  {[...Array(5)].map((_, i) => (
                    <line
                      key={i}
                      x1="50%"
                      y1="80"
                      x2={`${20 + i * 15}%`}
                      y2="350"
                      stroke="rgba(16, 185, 129, 0.3)"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      className="animate-pulse"
                      style={{
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </svg>
              </div>
            </div>
          </div>

          {/* Explanation Text Below */}
          {/* <div className="mt-16 text-center max-w-3xl mx-auto">
            <p className="text-lg text-foreground/70 leading-relaxed">
              Instead of sending large lump sums, <span className="text-green font-semibold">drip your payments</span> steadily over time.
              <br />
              Perfect for salaries, subscriptions, recurring expenses, and more. Every second, every hour, every day—automatic.
            </p>
          </div> */}
        </div>
      </section>
    </main>
  );
}
