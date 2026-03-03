"use client";

import { Vote, ExternalLink, Star } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const FLOWSTATE_VOTE_URL =
  "https://flowstate.network/flow-councils/42220/0xfabef1abae4998146e8a8422813eb787caa26ec2";

export function VoteForDrip() {
  return (
    <Card className="glass-card border-green/30 card-glow">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-green" />
          Vote for Drip
        </CardTitle>
        <CardDescription>
          Support Drip in the GoodDollar Builders Round 3
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground/70">
          Help us grow by voting for Drip on the GoodDollar Builders platform.
          Your vote directs funding to keep Drip running and improving.
        </p>
        <Button className="w-full hero-cta-button" size="lg" asChild>
          <a
            href={FLOWSTATE_VOTE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <Vote className="h-4 w-4" />
            Vote for Drip
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
