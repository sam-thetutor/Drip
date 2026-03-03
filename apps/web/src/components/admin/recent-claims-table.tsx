"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Claim {
  id: string;
  address: string;
  amount: string;
  transactionHash: string | null;
  claimedAt: string;
  chainId: number;
}

interface RecentClaimsTableProps {
  claims: Claim[];
  loading: boolean;
  pagination?: {
    total: number;
    page: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  onPageChange?: (page: number) => void;
}

export function RecentClaimsTable({ claims, loading, pagination, onPageChange }: RecentClaimsTableProps) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast.success("Address copied!");
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getExplorerUrl = (txHash: string, chainId: number) => {
    if (chainId === 42220) {
      return `https://celoscan.io/tx/${txHash}`;
    }
    return `https://explorer.celo.org/alfajores/tx/${txHash}`;
  };

  if (loading) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Claims</CardTitle>
          <CardDescription>Latest UBI claims from users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Loading claims...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!claims || claims.length === 0) {
    return (
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Recent Claims</CardTitle>
          <CardDescription>Latest UBI claims from users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No claims yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Recent Claims</CardTitle>
        <CardDescription>
          Latest UBI claims from users {pagination && `(${pagination.total} total)`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Address</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Amount (G$)</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Claimed At</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((claim) => (
                <tr key={claim.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{truncateAddress(claim.address)}</span>
                      <button
                        onClick={() => copyAddress(claim.address)}
                        className="text-muted-foreground hover:text-green transition-colors"
                      >
                        {copiedAddress === claim.address ? (
                          <CheckCircle2 className="h-4 w-4 text-green" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-green">
                      {parseFloat(claim.amount).toFixed(2)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {new Date(claim.claimedAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    {claim.transactionHash ? (
                      <a
                        href={getExplorerUrl(claim.transactionHash, claim.chainId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-green hover:underline text-sm"
                      >
                        View
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
            <div className="text-sm text-muted-foreground">
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(pagination.page - 1)}
                disabled={!pagination.hasPrev}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange?.(pagination.page + 1)}
                disabled={!pagination.hasNext}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
