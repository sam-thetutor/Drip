import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

/**
 * POST /api/gooddollar/claim/log
 * Log a successful UBI claim to the database
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { address, amount, amountWei, transactionHash, chainId } = body;

    // Validate required fields
    if (!address || !amount || !amountWei) {
      return NextResponse.json(
        { error: "Missing required fields: address, amount, amountWei" },
        { status: 400 }
      );
    }

    // Validate address format
    if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Create the UBI claim record
    const { data: claim, error: claimError } = await supabase
      .from('UbiClaim')
      .insert({
        address: normalizedAddress,
        amount: parseFloat(amount),
        amountWei,
        transactionHash: transactionHash || null,
        chainId: chainId || 42220,
        claimedAt: new Date().toISOString(),
      })
      .select()
      .single();

    if (claimError) {
      console.error("Error creating claim:", claimError);
      return NextResponse.json(
        { error: "Failed to create claim record" },
        { status: 500 }
      );
    }

    // Check if user stats exist
    const { data: existingStats } = await supabase
      .from('UserStats')
      .select('*')
      .eq('address', normalizedAddress)
      .single();

    if (existingStats) {
      // Update existing stats
      await supabase
        .from('UserStats')
        .update({
          ubiClaimCount: existingStats.ubiClaimCount + 1,
          totalUbiClaimed: parseFloat(existingStats.totalUbiClaimed || '0') + parseFloat(amount),
          lastUbiClaim: new Date().toISOString(),
        })
        .eq('address', normalizedAddress);
    } else {
      // Create new stats
      await supabase
        .from('UserStats')
        .insert({
          address: normalizedAddress,
          ubiClaimCount: 1,
          totalUbiClaimed: parseFloat(amount),
          lastUbiClaim: new Date().toISOString(),
          streamsCreated: 0,
          withdrawalsClaimed: 0,
          totalDeposited: 0,
          totalWithdrawn: 0,
          points: 0,
        });
    }

    return NextResponse.json(
      { 
        success: true, 
        claim: {
          id: claim.id,
          address: claim.address,
          amount: claim.amount.toString(),
          claimedAt: claim.claimedAt,
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error logging UBI claim:", error);
    return NextResponse.json(
      { error: "Failed to log UBI claim" },
      { status: 500 }
    );
  }
}
