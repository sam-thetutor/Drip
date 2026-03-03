import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * GET /api/gooddollar/claims
 * Get recent UBI claims with pagination
 * Query params: ?page=1&limit=50
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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: "Invalid pagination parameters. Page must be >= 1, limit between 1-100" },
        { status: 400 }
      );
    }

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    // Get total count for pagination
    const { count: total } = await supabase
      .from('UbiClaim')
      .select('*', { count: 'exact', head: true });

    // Get paginated claims
    const { data: claims, error } = await supabase
      .from('UbiClaim')
      .select('id, address, amount, transactionHash, claimedAt, chainId')
      .order('claimedAt', { ascending: false })
      .range(start, end);

    if (error) {
      console.error("Error fetching claims:", error);
      return NextResponse.json(
        { error: "Failed to fetch claims" },
        { status: 500 }
      );
    }

    const totalPages = Math.ceil((total || 0) / limit);

    return NextResponse.json({
      claims: (claims || []).map((claim) => ({
        id: claim.id,
        address: claim.address,
        amount: claim.amount?.toString() || '0',
        transactionHash: claim.transactionHash,
        claimedAt: claim.claimedAt,
        chainId: claim.chainId,
      })),
      pagination: {
        total: total || 0,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching UBI claims:", error);
    return NextResponse.json(
      { error: "Failed to fetch UBI claims" },
      { status: 500 }
    );
  }
}
