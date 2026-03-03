-- ============================================
-- Supabase Migration: UBI Tracking Tables
-- ============================================

-- Create UbiClaim table for tracking individual UBI claims
CREATE TABLE IF NOT EXISTS "UbiClaim" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "address" TEXT NOT NULL,
    "amount" NUMERIC NOT NULL,
    "amountWei" TEXT NOT NULL,
    "transactionHash" TEXT,
    "claimedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "chainId" INTEGER NOT NULL DEFAULT 42220
);

-- Create UserStats table if it doesn't exist
CREATE TABLE IF NOT EXISTS "UserStats" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "address" TEXT NOT NULL UNIQUE,
    "streamsCreated" INTEGER NOT NULL DEFAULT 0,
    "withdrawalsClaimed" INTEGER NOT NULL DEFAULT 0,
    "totalDeposited" NUMERIC NOT NULL DEFAULT 0,
    "totalWithdrawn" NUMERIC NOT NULL DEFAULT 0,
    "points" NUMERIC NOT NULL DEFAULT 0,
    "ubiClaimCount" INTEGER NOT NULL DEFAULT 0,
    "totalUbiClaimed" NUMERIC NOT NULL DEFAULT 0,
    "lastUbiClaim" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add UBI tracking columns to UserStats if they don't exist
-- (This handles cases where UserStats already exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'UserStats' AND column_name = 'ubiClaimCount') THEN
        ALTER TABLE "UserStats" ADD COLUMN "ubiClaimCount" INTEGER NOT NULL DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'UserStats' AND column_name = 'totalUbiClaimed') THEN
        ALTER TABLE "UserStats" ADD COLUMN "totalUbiClaimed" NUMERIC NOT NULL DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'UserStats' AND column_name = 'lastUbiClaim') THEN
        ALTER TABLE "UserStats" ADD COLUMN "lastUbiClaim" TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "UbiClaim_address_idx" ON "UbiClaim"("address");
CREATE INDEX IF NOT EXISTS "UbiClaim_claimedAt_idx" ON "UbiClaim"("claimedAt");
CREATE INDEX IF NOT EXISTS "UbiClaim_chainId_idx" ON "UbiClaim"("chainId");
CREATE INDEX IF NOT EXISTS "UserStats_address_idx" ON "UserStats"("address");

-- Enable Row Level Security (RLS)
ALTER TABLE "UbiClaim" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserStats" ENABLE ROW LEVEL SECURITY;

-- Create policies for service role (admin access)
-- These allow the service role key to bypass RLS entirely
CREATE POLICY "Service role can do everything on UbiClaim" 
    ON "UbiClaim" 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Service role can do everything on UserStats" 
    ON "UserStats" 
    FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

-- Optional: Allow public read access (if you want public dashboards)
-- Uncomment if needed:
-- CREATE POLICY "Public can read UbiClaim" 
--     ON "UbiClaim" 
--     FOR SELECT 
--     TO anon 
--     USING (true);
--
-- CREATE POLICY "Public can read UserStats" 
--     ON "UserStats" 
--     FOR SELECT 
--     TO anon 
--     USING (true);
