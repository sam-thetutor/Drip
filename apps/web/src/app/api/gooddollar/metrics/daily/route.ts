import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/gooddollar/metrics/daily
 * Get daily claim breakdown for charts
 * Query params: ?days=30 (default 30 days)
 */
export async function GET(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    // Validate days parameter
    if (days < 1 || days > 365) {
      return NextResponse.json(
        { error: "Days must be between 1 and 365" },
        { status: 400 }
      );
    }

    // Calculate date range: last N days including today
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    // Get all claims within the date range with pagination
    let allClaims: any[] = [];
    let page = 0;
    let hasMore = true;
    
    while (hasMore) {
      const { data, error } = await supabase
        .from('UbiClaim')
        .select('claimedAt, amount, address')
        .gte('claimedAt', startDate.toISOString())
        .range(page * 1000, (page + 1) * 1000 - 1);
      
      if (error) {
        console.error("Error fetching claims:", error);
        return NextResponse.json(
          { error: "Failed to fetch claims" },
          { status: 500 }
        );
      }
      
      if (data && data.length > 0) {
        allClaims.push(...data);
        hasMore = data.length === 1000;
        page++;
      } else {
        hasMore = false;
      }
    }

    const claims = allClaims;

    // Group by date
    const dailyData = new Map<string, { claimCount: number; uniqueUsers: Set<string>; totalAmount: number }>();

    // Initialize all dates in the range (from startDate to today, inclusive)
    const currentDate = new Date(startDate);
    const todayStr = endDate.toISOString().split('T')[0];
    
    for (let i = 0; i < days; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dailyData.set(dateStr, { claimCount: 0, uniqueUsers: new Set(), totalAmount: 0 });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Ensure today is included (in case of timezone issues)
    if (!dailyData.has(todayStr)) {
      dailyData.set(todayStr, { claimCount: 0, uniqueUsers: new Set(), totalAmount: 0 });
    }

    // Aggregate claims by date
    claims.forEach((claim) => {
      const dateStr = new Date(claim.claimedAt).toISOString().split('T')[0];
      const dayData = dailyData.get(dateStr);
      
      if (dayData) {
        dayData.claimCount++;
        dayData.uniqueUsers.add(claim.address.toLowerCase());
        dayData.totalAmount += parseFloat(claim.amount?.toString() || '0');
      }
    });

    // Convert to array format for response
    const result = Array.from(dailyData.entries())
      .map(([date, data]) => ({
        date,
        claimCount: data.claimCount,
        uniqueUsers: data.uniqueUsers.size,
        totalAmount: data.totalAmount.toFixed(2),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching daily UBI metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch daily UBI metrics" },
      { status: 500 }
    );
  }
}
