# Implementation Plan: Verify User Engagement Rewards Claims

## Overview
This plan outlines how to verify that users successfully claimed engagement rewards from the GoodDollar Engagement Rewards contract.

## Current State

### What We Have
1. **Events Emitted:**
   - `EngagementRewardClaimed(address indexed user, address indexed inviter, bool success)`
   - `EngagementRewardClaimedFailed(address indexed user, string reason)`

2. **Contract Integration:**
   - DripCore calls `engagementRewards.appClaim()` on stream creation/withdrawal
   - Errors are caught and emitted as events

## Verification Methods

### Method 1: Event-Based Verification (Recommended)
**Status:** ✅ Already implemented

**How it works:**
- Listen for `EngagementRewardClaimed` events from DripCore
- Check the `success` parameter in the event
- Event includes: `user`, `inviter`, and `success` boolean

**Implementation:**
```typescript
// Listen for events
const filter = dripCore.filters.EngagementRewardClaimed(userAddress);
const events = await dripCore.queryFilter(filter, fromBlock, toBlock);

// Check if claim was successful
const successfulClaims = events.filter(e => e.args.success === true);
```

**Pros:**
- Already implemented
- No external calls needed
- Fast and efficient
- Shows exact transaction that triggered the claim

**Cons:**
- Only shows claims made through DripCore
- Doesn't show reward amount

---

### Method 2: Direct Engagement Rewards Contract Query
**Status:** ⚠️ Needs implementation

**How it works:**
- Query the Engagement Rewards contract directly
- Check user's claim status, cooldown, and last claim time
- Verify if user is registered and eligible

**Implementation:**
```typescript
// Check last claim time
const lastClaimed = await engagementRewards.lastClaimed(appAddress, userAddress);
const cooldownPeriod = await engagementRewards.cooldownPeriod();
const canClaim = await engagementRewards.canClaim(appAddress, userAddress);

// Check if user is registered
const isRegistered = await engagementRewards.isUserRegistered(appAddress, userAddress);
```

**Pros:**
- Most accurate verification
- Shows cooldown status
- Can check eligibility before claiming

**Cons:**
- Requires external contract calls
- More complex to implement

---

### Method 3: Token Balance Check
**Status:** ⚠️ Needs implementation

**How it works:**
- Check user's G$ (GoodDollar) token balance before and after claim
- Calculate the difference to determine reward amount

**Implementation:**
```typescript
// Get G$ token address from Engagement Rewards contract
const gdTokenAddress = await engagementRewards.gdToken();

// Check balance before and after
const balanceBefore = await gdToken.balanceOf(userAddress);
// ... user claims ...
const balanceAfter = await gdToken.balanceOf(userAddress);
const rewardAmount = balanceAfter - balanceBefore;
```

**Pros:**
- Shows actual reward amount received
- Verifies tokens were transferred

**Cons:**
- Requires knowing G$ token address
- Need to track balance at specific times
- Doesn't work if user spent tokens

---

### Method 4: Transaction Receipt Analysis
**Status:** ⚠️ Needs implementation

**How it works:**
- Analyze the transaction receipt from stream creation/withdrawal
- Look for `EngagementRewardClaimed` events
- Parse event data to verify success

**Implementation:**
```typescript
// After stream creation transaction
const receipt = await tx.wait();

// Parse events
const events = receipt.logs
  .map(log => {
    try {
      return dripCore.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .filter(e => e?.name === "EngagementRewardClaimed");

// Check success
const claimSuccess = events.some(e => e.args.success === true);
```

**Pros:**
- Immediate verification
- No additional queries needed
- Works with current transaction

**Cons:**
- Only works for current transaction
- Need to parse logs correctly

---

## Recommended Implementation Plan

### Phase 1: Event-Based Verification (Frontend)
**Priority:** High
**Effort:** Low
**Timeline:** 1-2 hours

1. **Create React Hook: `useEngagementRewardStatus`**
   - Listen for `EngagementRewardClaimed` events
   - Track user's claim history
   - Display claim status in UI

2. **Update Stream Creation Component**
   - Show claim status after stream creation
   - Display success/failure message
   - Show reward amount if available

3. **Create Claim History Component**
   - List all user's claims
   - Show timestamps and success status
   - Display inviter information

### Phase 2: Direct Contract Verification
**Priority:** Medium
**Effort:** Medium
**Timeline:** 2-3 hours

1. **Extend `useEngagementRewards` Hook**
   - Add `checkClaimStatus(userAddress)` function
   - Query `lastClaimed`, `cooldownPeriod`, `canClaim`
   - Return comprehensive claim status

2. **Create Verification Utility**
   - `verifyUserClaim(userAddress, transactionHash)`
   - Cross-reference events with contract state
   - Validate claim was successful

3. **Add Status Display**
   - Show cooldown timer
   - Display next eligible claim time
   - Warn if user can't claim yet

### Phase 3: Balance Tracking (Optional)
**Priority:** Low
**Effort:** High
**Timeline:** 3-4 hours

1. **Track G$ Token Address**
   - Get from Engagement Rewards contract
   - Store in config

2. **Balance Snapshot System**
   - Take balance snapshot before claim
   - Compare after claim
   - Calculate reward amount

3. **Reward Amount Display**
   - Show exact reward received
   - Display in user's currency preference
   - Add to claim history

---

## Implementation Details

### 1. Event Listener Hook

```typescript
// apps/web/src/lib/gooddollar/hooks/useEngagementRewardStatus.ts
export function useEngagementRewardStatus(userAddress: Address) {
  const { data: claims, isLoading } = useContractEvent({
    address: DRIP_CORE_ADDRESS,
    abi: DripCoreABI,
    eventName: 'EngagementRewardClaimed',
    args: { user: userAddress },
    // ... config
  });

  return {
    claims,
    isLoading,
    lastClaim: claims?.[claims.length - 1],
    hasSuccessfulClaim: claims?.some(c => c.args.success === true),
  };
}
```

### 2. Contract Status Checker

```typescript
// apps/web/src/lib/gooddollar/utils/verifyClaim.ts
export async function verifyClaimStatus(
  userAddress: Address,
  appAddress: Address
) {
  const engagementRewards = getEngagementRewardsContract();
  
  const [lastClaimed, cooldownPeriod, canClaim, isRegistered] = await Promise.all([
    engagementRewards.read.lastClaimed([appAddress, userAddress]),
    engagementRewards.read.cooldownPeriod(),
    engagementRewards.read.canClaim([appAddress, userAddress]),
    engagementRewards.read.isUserRegistered([appAddress, userAddress]),
  ]);

  const nextClaimTime = lastClaimed + cooldownPeriod;
  const canClaimNow = canClaim && Date.now() / 1000 >= Number(nextClaimTime);

  return {
    lastClaimed: Number(lastClaimed),
    cooldownPeriod: Number(cooldownPeriod),
    nextClaimTime: Number(nextClaimTime),
    canClaim: canClaimNow,
    isRegistered,
  };
}
```

### 3. UI Component

```typescript
// apps/web/src/components/gooddollar/reward-claim-status.tsx
export function RewardClaimStatus({ userAddress }: { userAddress: Address }) {
  const { claims, isLoading } = useEngagementRewardStatus(userAddress);
  const claimStatus = useEngagementRewardClaimStatus(userAddress);

  if (isLoading) return <Loading />;

  return (
    <div>
      <h3>Engagement Rewards Status</h3>
      {claimStatus.canClaim ? (
        <p>✅ Eligible to claim</p>
      ) : (
        <p>⏳ Cooldown active. Next claim: {formatDate(claimStatus.nextClaimTime)}</p>
      )}
      
      <h4>Claim History</h4>
      {claims?.map((claim, i) => (
        <div key={i}>
          {claim.args.success ? '✅' : '❌'} 
          Claimed at block {claim.blockNumber}
        </div>
      ))}
    </div>
  );
}
```

---

## Testing Strategy

### Unit Tests
1. Test event parsing
2. Test claim status verification
3. Test cooldown calculations

### Integration Tests
1. Create stream and verify event emission
2. Check claim status after stream creation
3. Verify cooldown period enforcement

### E2E Tests
1. User creates stream → verify claim event
2. Check UI displays claim status
3. Verify cooldown timer works

---

## Files to Create/Modify

### New Files
1. `apps/web/src/lib/gooddollar/hooks/useEngagementRewardStatus.ts`
2. `apps/web/src/lib/gooddollar/utils/verifyClaim.ts`
3. `apps/web/src/components/gooddollar/reward-claim-status.tsx`
4. `apps/web/src/components/gooddollar/claim-history.tsx`

### Modified Files
1. `apps/web/src/lib/gooddollar/hooks/useEngagementRewards.ts` - Add status checking
2. `apps/web/src/components/create-stream-form.tsx` - Show claim status
3. `apps/web/src/components/withdraw-modal.tsx` - Show claim status

---

## Success Criteria

✅ User can see if their claim was successful
✅ User can view their claim history
✅ User knows when they can claim next (cooldown)
✅ UI displays clear success/failure messages
✅ Verification works both on-chain and off-chain

---

## Next Steps

1. **Start with Phase 1** - Event-based verification (easiest, most immediate value)
2. **Add Phase 2** - Contract status checking (better UX)
3. **Consider Phase 3** - Balance tracking (if reward amounts are important)

