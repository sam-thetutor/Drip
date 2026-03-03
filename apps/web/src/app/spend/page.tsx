"use client";

import { useAccount, useBalance, useChainId } from "wagmi";
import {
  CreditCard,
  Gift,
  Video,
  GraduationCap,
  Store,
  Coins,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTokenAddressBySymbol } from "@/lib/tokens/config";
import { formatTokenAmountWithDecimals } from "@/lib/utils/format";

const spendCategories = [
  {
    title: "Digital Services",
    description: "Mobile airtime, bill payments, subscriptions",
    icon: CreditCard,
    items: ["Buy Mobile Airtime", "Pay Bills", "Donate to Causes"],
  },
  {
    title: "Send & Gift",
    description: "Send to friends, gift cards, P2P payments",
    icon: Gift,
    items: ["Send to Friend", "Gift Card", "Pay via QR Code"],
  },
  {
    title: "Content Tipping",
    description: "Tip creators, support artists, live streaming",
    icon: Video,
    items: ["Tip Creator", "Support Artists", "Live Stream Tips"],
  },
  {
    title: "Education & Skills",
    description: "Online courses, mentorship, skill-sharing",
    icon: GraduationCap,
    items: ["Pay for Courses", "Skill-Share", "Mentorship Sessions"],
  },
  {
    title: "Merchant Payments",
    description: "Pay stores, loyalty rewards, local shops",
    icon: Store,
    items: ["Pay Partner Stores", "Loyalty Rewards", "Find Near Me"],
  },
];

export default function SpendPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const goodDollarAddress = getTokenAddressBySymbol("G$", chainId);

  const { data: gdBalance, isLoading: gdLoading } = useBalance({
    address: address as `0x${string}` | undefined,
    token: goodDollarAddress,
    query: {
      enabled: !!address && !!goodDollarAddress,
      refetchInterval: 30000,
      refetchOnWindowFocus: false,
      staleTime: 20 * 1000,
    },
  });

  const gdFormatted = gdBalance
    ? formatTokenAmountWithDecimals(gdBalance.value, gdBalance.decimals, 2)
    : "0.00";

  return (
    <main className="flex-1">
      <div className="container mx-auto max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.45em] text-foreground/60">
            Spend
          </p>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            GoodDollar economy
          </h1>
          <p className="text-sm text-foreground/70">
            Use your G$ tokens for real-world services and utilities.
          </p>
        </div>

        {/* Balance Display */}
        {isConnected && (
          <Card className="glass-card mb-8">
            <CardContent className="flex items-center justify-between py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green/10">
                  <Coins className="h-5 w-5 text-green" />
                </div>
                <div>
                  <p className="text-xs text-foreground/60">Available Balance</p>
                  <p className="text-xl font-bold text-white">
                    {gdLoading ? "..." : `${gdFormatted} G$`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spend Categories */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spendCategories.map((category) => {
            const Icon = category.icon;
            return (
              <Card key={category.title} className="glass-card card-hover relative overflow-hidden">
                {/* Coming Soon Badge */}
                <div className="absolute top-3 right-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-foreground/60">
                    <Lock className="h-3 w-3" />
                    Coming Soon
                  </span>
                </div>

                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green/10">
                      <Icon className="h-5 w-5 text-green" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{category.title}</CardTitle>
                      <p className="text-xs text-foreground/50 mt-0.5">
                        {category.description}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-2">
                  {category.items.map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-foreground/60"
                    >
                      <span>{item}</span>
                      <Lock className="h-3.5 w-3.5 text-foreground/30" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </main>
  );
}
