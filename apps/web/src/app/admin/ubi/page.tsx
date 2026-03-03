"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useIsAdmin } from "@/lib/admin/auth";
import { UbiMetricsCards } from "@/components/admin/ubi-metrics-cards";
import { UbiClaimsChart } from "@/components/admin/ubi-claims-chart";
import { RecentClaimsTable } from "@/components/admin/recent-claims-table";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, AlertCircle } from "lucide-react";

interface UbiMetrics {
  totalClaims: number;
  uniqueClaimers: number;
  totalAmountClaimed: string;
  claimsToday: number;
  claimsThisWeek: number;
  claimsThisMonth: number;
  averageClaimAmount: string;
  topClaimers: Array<{
    address: string;
    claimCount: number;
    totalClaimed: string;
  }>;
}

interface DailyMetric {
  date: string;
  claimCount: number;
  uniqueUsers: number;
  totalAmount: string;
}

interface Claim {
  id: string;
  address: string;
  amount: string;
  transactionHash: string | null;
  claimedAt: string;
  chainId: number;
}

interface ClaimsResponse {
  claims: Claim[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function AdminUbiPage() {
  const { address, isConnected } = useAccount();
  const isAdmin = useIsAdmin();

  const [metrics, setMetrics] = useState<UbiMetrics | null>(null);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetric[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [pagination, setPagination] = useState<ClaimsResponse['pagination'] | undefined>();
  const [currentPage, setCurrentPage] = useState(1);

  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [loadingClaims, setLoadingClaims] = useState(true);

  // Fetch metrics
  useEffect(() => {
    async function fetchMetrics() {
      try {
        // Add timestamp to prevent caching
        const timestamp = Date.now();
        const res = await fetch(`/api/gooddollar/metrics?_t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (res.ok) {
          const data = await res.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      } finally {
        setLoadingMetrics(false);
      }
    }

    if (isAdmin) {
      fetchMetrics();
    }
  }, [isAdmin]);

  // Fetch daily metrics
  useEffect(() => {
    async function fetchDailyMetrics() {
      try {
        const timestamp = Date.now();
        const res = await fetch(`/api/gooddollar/metrics/daily?days=30&_t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (res.ok) {
          const data = await res.json();
          setDailyMetrics(data);
        }
      } catch (error) {
        console.error("Failed to fetch daily metrics:", error);
      } finally {
        setLoadingDaily(false);
      }
    }

    if (isAdmin) {
      fetchDailyMetrics();
    }
  }, [isAdmin]);

  // Fetch claims
  useEffect(() => {
    async function fetchClaims() {
      setLoadingClaims(true);
      try {
        const timestamp = Date.now();
        const res = await fetch(`/api/gooddollar/claims?page=${currentPage}&limit=20&_t=${timestamp}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });
        if (res.ok) {
          const data: ClaimsResponse = await res.json();
          setClaims(data.claims);
          setPagination(data.pagination);
        }
      } catch (error) {
        console.error("Failed to fetch claims:", error);
      } finally {
        setLoadingClaims(false);
      }
    }

    if (isAdmin) {
      fetchClaims();
    }
  }, [isAdmin, currentPage]);

  // Not connected
  if (!isConnected) {
    return (
      <div className="container max-w-7xl py-8">
        <Card className="glass-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Wallet Not Connected</h2>
            <p className="text-muted-foreground text-center">
              Please connect your wallet to access the admin panel.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Not admin
  if (!isAdmin) {
    return (
      <div className="container max-w-7xl py-8">
        <Card className="glass-card border-red-500/20">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground text-center mb-4">
              You do not have permission to access this page.
            </p>
            <p className="text-sm text-muted-foreground font-mono">
              Connected: {address}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-8 w-8 text-green" />
            UBI Admin Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor and analyze GoodDollar UBI claims on your platform
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <UbiMetricsCards metrics={metrics} loading={loadingMetrics} />

      {/* Additional Stats */}
      {metrics && !loadingMetrics && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">This Week</div>
              <div className="text-2xl font-bold text-green">
                {metrics.claimsThisWeek.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">claims</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">This Month</div>
              <div className="text-2xl font-bold text-blue-500">
                {metrics.claimsThisMonth.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground mt-1">claims</div>
            </CardContent>
          </Card>
          <Card className="glass-card">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-1">Average Claim</div>
              <div className="text-2xl font-bold text-purple-500">
                {parseFloat(metrics.averageClaimAmount).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">G$ per claim</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Chart */}
      <UbiClaimsChart data={dailyMetrics} loading={loadingDaily} />

      {/* Top Claimers */}
      {metrics && metrics.topClaimers.length > 0 && (
        <Card className="glass-card">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold mb-4">Top Claimers</h3>
            <div className="space-y-3">
              {metrics.topClaimers.map((claimer, index) => (
                <div key={claimer.address} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green/20 flex items-center justify-center text-green font-semibold text-sm">
                      #{index + 1}
                    </div>
                    <div>
                      <div className="font-mono text-sm">
                        {claimer.address.slice(0, 6)}...{claimer.address.slice(-4)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {claimer.claimCount} claims
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-green">
                      {parseFloat(claimer.totalClaimed).toFixed(2)} G$
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Claims Table */}
      <RecentClaimsTable
        claims={claims}
        loading={loadingClaims}
        pagination={pagination}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
