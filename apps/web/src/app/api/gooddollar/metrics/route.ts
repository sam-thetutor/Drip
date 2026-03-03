import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/gooddollar/metrics
 * Get overall UBI claim metrics and statistics
 */
export async function GET() {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Use UserStats as source-of-truth for aggregate totals
    const { data: userStatsData } = await supabase
      .from('UserStats')
      .select('address, ubiClaimCount, totalUbiClaimed')
      .gt('ubiClaimCount', 0);

    const statsRows = userStatsData || [];
    const uniqueClaimers = statsRows.length;
    const totalClaims = statsRows.reduce((sum, row) => sum + Number(row.ubiClaimCount || 0), 0);
    const totalAmountClaimed = statsRows.reduce((sum, row) => sum + parseFloat(row.totalUbiClaimed || 0), 0);

    // Claims today
    const { count: claimsToday } = await supabase
      .from('UbiClaim')
      .select('*', { count: 'exact', head: true })
      .gte('claimedAt', todayStart);

    // Claims this week
    const { count: claimsThisWeek } = await supabase
      .from('UbiClaim')
      .select('*', { count: 'exact', head: true })
      .gte('claimedAt', weekStart);

    // Claims this month
    const { count: claimsThisMonth } = await supabase
      .from('UbiClaim')
      .select('*', { count: 'exact', head: true })
      .gte('claimedAt', monthStart);

    // Average claim amount
    const averageClaimAmount = totalClaims && totalClaims > 0
      ? (totalAmountClaimed / totalClaims).toString()
      : "0";

    // Top claimers (top 10)
    const { data: topClaimersData } = await supabase
      .from('UserStats')
      .select('address, ubiClaimCount, totalUbiClaimed, lastUbiClaim')
      .gt('ubiClaimCount', 0)
      .order('totalUbiClaimed', { ascending: false })
      .limit(10);

    const topClaimers = (topClaimersData || []).map((user) => ({
      address: user.address,
      claimCount: user.ubiClaimCount,
      totalClaimed: user.totalUbiClaimed?.toString() || "0",
      lastClaim: user.lastUbiClaim,
    }));

    return NextResponse.json({
      totalClaims: totalClaims || 0,
      uniqueClaimers,
      totalAmountClaimed: totalAmountClaimed.toString(),
      claimsToday: claimsToday || 0,
      claimsThisWeek: claimsThisWeek || 0,
      claimsThisMonth: claimsThisMonth || 0,
      averageClaimAmount,
      topClaimers,
    });
  } catch (error) {
    console.error("Error fetching UBI metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch UBI metrics" },
      { status: 500 }
    );
  }
}
