"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LeaderboardEntry {
  address: string;
  streamsCreated: number;
  withdrawalsClaimed: number;
  totalDeposited: string;
  totalWithdrawn: string;
  points: string;
  rank: number;
  updatedAt: string;
}

interface UserStats {
  address: string;
  streamsCreated: number;
  withdrawalsClaimed: number;
  totalDeposited: string;
  totalWithdrawn: string;
  points: string;
  rank: number | null;
  updatedAt?: string;
}

export default function LeaderboardPage() {
  const { address } = useAccount();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leaderboard", { cache: "no-store" });
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);

        if (address) {
          const userRes = await fetch(
            `/api/leaderboard/user/${address}`,
            { cache: "no-store" }
          );
          const userData = await userRes.json();
          setUserStats(userData);
        } else {
          setUserStats(null);
        }
      } catch (e) {
        console.error("Failed to load leaderboard", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [address]);

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            See who is most active creating and withdrawing from streams.
          </p>
        </div>
        {userStats && (
          <Card className="w-full md:w-auto">
            <CardContent className="pt-4 pb-4 px-4 flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">
                Your rank
              </p>
              <p className="text-2xl font-bold">
                {userStats.rank ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Points: {userStats.points}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base md:text-lg">
            Top Users
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Loading leaderboard...
            </div>
          ) : entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No activity yet. Create a stream or withdraw from one to appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/60">
                  <tr className="text-left">
                    <th className="px-4 py-2">Rank</th>
                    <th className="px-4 py-2">Address</th>
                    <th className="px-4 py-2 hidden md:table-cell">
                      Streams Created
                    </th>
                    <th className="px-4 py-2 hidden md:table-cell">
                      Withdrawals
                    </th>
                    <th className="px-4 py-2">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.address}
                      className="border-t border-border/60 hover:bg-muted/40 transition-colors"
                    >
                      <td className="px-4 py-2">{entry.rank}</td>
                      <td className="px-4 py-2 font-mono text-xs md:text-sm">
                        {entry.address.slice(0, 6)}...
                        {entry.address.slice(-4)}
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        {entry.streamsCreated}
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        {entry.withdrawalsClaimed}
                      </td>
                      <td className="px-4 py-2">{entry.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


