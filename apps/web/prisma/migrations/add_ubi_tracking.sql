-- CreateTable - UbiClaim table for tracking individual UBI claims
CREATE TABLE "UbiClaim" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "amountWei" TEXT NOT NULL,
    "transactionHash" TEXT,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chainId" INTEGER NOT NULL,

    CONSTRAINT "UbiClaim_pkey" PRIMARY KEY ("id")
);

-- AlterTable - Add UBI tracking fields to UserStats
ALTER TABLE "UserStats" ADD COLUMN "ubiClaimCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "totalUbiClaimed" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "UserStats" ADD COLUMN "lastUbiClaim" TIMESTAMP(3);

-- CreateIndex - Add indexes for performance
CREATE INDEX "UbiClaim_address_idx" ON "UbiClaim"("address");
CREATE INDEX "UbiClaim_claimedAt_idx" ON "UbiClaim"("claimedAt");
CREATE INDEX "UbiClaim_chainId_idx" ON "UbiClaim"("chainId");
