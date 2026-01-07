# Good Dollar Engagement Rewards Integration Plan
## Smart Contract + Client Side Integration

## Overview
This document outlines the implementation plan for integrating Good Dollar Engagement Rewards into Drip using the **Smart Contract + Client Side** approach. This allows DripCore to directly call the EngagementRewards contract when users perform actions.

---

## 🎯 Integration Strategy

### Key Integration Points
1. **First Stream Creation** - User creates their first stream → Claim reward
2. **First Stream Received** - User receives their first stream → Claim reward  
3. **First Subscription** - User creates their first subscription → Claim reward
4. **Referral System** - Track inviters and reward both inviter and invitee

### Architecture Decision
- **Add to DripCore**: Since DripCore is upgradeable, we'll add engagement rewards functionality directly to it
- **Non-blocking**: Reward claims won't block core functionality (use try/catch)
- **Optional**: Users can opt-in to engagement rewards

---

## 📋 Phase 1: Smart Contract Foundation

### 1.1 Create Engagement Rewards Interface
**File**: `apps/contracts/contracts/interfaces/IEngagementRewards.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IEngagementRewards {
    function appClaim(
        address user,
        address inviter,
        uint256 validUntilBlock,
        bytes memory signature
    ) external returns (bool);

    function appClaim(
        address user,
        address inviter,
        uint256 validUntilBlock,
        bytes memory signature,
        uint8 userAndInviterPercentage,
        uint8 userPercentage
    ) external returns (bool);
}
```

**Tasks**:
- [ ] Create interface file
- [ ] Add both function signatures (basic and advanced with percentages)

---

### 1.2 Add Engagement Rewards to DripCore
**File**: `apps/contracts/contracts/DripCore.sol`

**Changes Needed**:

1. **Add State Variables**:
```solidity
// Engagement Rewards integration
IEngagementRewards public engagementRewards;
bool public engagementRewardsEnabled;
mapping(address => bool) public hasClaimedFirstStreamCreation;
mapping(address => bool) public hasClaimedFirstStreamReceived;
mapping(address => address) public userInviter; // Track who invited each user
```

2. **Add Initialization** (in `initialize` function):
```solidity
engagementRewardsEnabled = false; // Enable via setter after deployment
```

3. **Add Setter Functions**:
```solidity
function setEngagementRewards(address _engagementRewards) external onlyOwner {
    require(_engagementRewards != address(0), "Invalid address");
    engagementRewards = IEngagementRewards(_engagementRewards);
}

function setEngagementRewardsEnabled(bool _enabled) external onlyOwner {
    engagementRewardsEnabled = _enabled;
}

function setInviter(address inviter) external {
    require(inviter != address(0), "Invalid inviter");
    require(inviter != msg.sender, "Cannot invite self");
    require(userInviter[msg.sender] == address(0), "Inviter already set");
    userInviter[msg.sender] = inviter;
}
```

4. **Modify `createStream` Function**:
Add reward claiming after stream creation:
```solidity
// After stream creation (line ~194)
if (engagementRewardsEnabled && address(engagementRewards) != address(0)) {
    _tryClaimEngagementReward(
        msg.sender,
        userInviter[msg.sender],
        validUntilBlock,
        signature
    );
}
```

5. **Modify `withdraw` Function**:
Add reward claiming for first-time recipients:
```solidity
// After successful withdrawal
if (engagementRewardsEnabled && address(engagementRewards) != address(0)) {
    if (!hasClaimedFirstStreamReceived[recipient]) {
        _tryClaimEngagementReward(
            recipient,
            userInviter[recipient],
            validUntilBlock,
            signature
        );
        hasClaimedFirstStreamReceived[recipient] = true;
    }
}
```

6. **Add Internal Helper Function**:
```solidity
function _tryClaimEngagementReward(
    address user,
    address inviter,
    uint256 validUntilBlock,
    bytes memory signature
) internal {
    if (address(engagementRewards) == address(0)) return;
    if (!engagementRewardsEnabled) return;
    
    try engagementRewards.appClaim(
        user,
        inviter,
        validUntilBlock,
        signature
    ) returns (bool success) {
        if (success) {
            emit EngagementRewardClaimed(user, inviter, true);
        } else {
            emit EngagementRewardClaimed(user, inviter, false);
        }
    } catch Error(string memory reason) {
        emit EngagementRewardClaimFailed(user, reason);
    } catch {
        emit EngagementRewardClaimFailed(user, "Unknown error");
    }
}
```

7. **Add Events**:
```solidity
event EngagementRewardClaimed(address indexed user, address indexed inviter, bool success);
event EngagementRewardClaimFailed(address indexed user, string reason);
event InviterSet(address indexed user, address indexed inviter);
```

**Tasks**:
- [ ] Add state variables
- [ ] Add setter functions
- [ ] Modify `createStream` to include reward claiming
- [ ] Modify `withdraw` to include reward claiming for recipients
- [ ] Add internal helper function
- [ ] Add events
- [ ] Update interface `IDrip.sol` if needed

---

### 1.3 Add to SubscriptionManager (Optional)
**File**: `apps/contracts/contracts/SubscriptionManager.sol`

Similar integration for subscription creation:
- [ ] Add engagement rewards state variables
- [ ] Add reward claiming on first subscription creation
- [ ] Track `hasClaimedFirstSubscription` per user

---

### 1.4 Update Contract Configuration
**File**: `apps/web/src/lib/contracts/config.ts`

Add engagement rewards contract addresses:
```typescript
export const ENGAGEMENT_REWARDS_CONTRACTS = {
  [CELO_MAINNET_ID]: {
    DEV: "0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465" as `0x${string}`,
    PRODUCTION: "0x25db74CF4E7BA120526fd87e159CF656d94bAE43" as `0x${string}`,
  },
  [CELO_SEPOLIA_ID]: {
    DEV: "0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465" as `0x${string}`,
    PRODUCTION: "0x25db74CF4E7BA120526fd87e159CF656d94bAE43" as `0x${string}`,
  },
} as const;
```

**Tasks**:
- [ ] Add contract addresses to config
- [ ] Add helper function to get contract address by chain and environment

---

### 1.5 Update Deployment Scripts
**File**: `apps/contracts/ignition/modules/DripProxy.ts`

Add engagement rewards initialization:
- [ ] Add parameter for engagement rewards contract address
- [ ] Call `setEngagementRewards` after deployment
- [ ] Optionally enable rewards via `setEngagementRewardsEnabled(true)`

**Tasks**:
- [ ] Update deployment module
- [ ] Add environment variable for engagement rewards address
- [ ] Update deployment documentation

---

## 📋 Phase 2: Frontend Integration

### 2.1 Install Engagement SDK
**File**: `apps/web/package.json`

```bash
pnpm add @goodsdks/engagement-sdk
```

**Tasks**:
- [ ] Install package
- [ ] Verify package version compatibility

---

### 2.2 Create Engagement Rewards Hook
**File**: `apps/web/src/lib/gooddollar/hooks/useEngagementRewards.ts`

Create hook similar to `useClaimSDK.ts`:
- Initialize EngagementRewardsSDK
- Check user registration status
- Generate signatures for first-time users
- Get current block number
- Check eligibility

**Key Functions**:
```typescript
- useEngagementRewards(contractAddress)
- isUserRegistered(appAddress, userAddress)
- signClaim(appAddress, inviterAddress, validUntilBlock)
- getCurrentBlockNumber()
- canClaim(appAddress, userAddress)
```

**Tasks**:
- [ ] Create hook file
- [ ] Implement SDK initialization
- [ ] Implement signature generation
- [ ] Implement eligibility checking
- [ ] Add error handling
- [ ] Add loading states

---

### 2.3 Create Engagement Rewards Types
**File**: `apps/web/src/lib/gooddollar/types.ts`

Add types:
```typescript
export type EngagementRewardsEnv = "dev" | "production";
export interface EngagementRewardsConfig {
  contractAddress: `0x${string}`;
  env: EngagementRewardsEnv;
}
```

**Tasks**:
- [ ] Add engagement rewards types
- [ ] Export types

---

### 2.4 Create Engagement Rewards Constants
**File**: `apps/web/src/lib/gooddollar/constants.ts`

Add:
```typescript
export const ENGAGEMENT_REWARDS_CONTRACTS = {
  // ... from config.ts
};

export const ENGAGEMENT_REWARDS_ENV = 
  (process.env.NEXT_PUBLIC_ENGAGEMENT_REWARDS_ENV as "dev" | "production") || "dev";
```

**Tasks**:
- [ ] Add constants
- [ ] Add environment variable support

---

### 2.5 Create Engagement Rewards UI Components

#### 2.5.1 Invite Link Component
**File**: `apps/web/src/components/gooddollar/invite-link-card.tsx`

Features:
- Generate invite link with user's address
- Copy to clipboard
- Share buttons (Twitter, WhatsApp, etc.)
- Show invite count/earnings

**Tasks**:
- [ ] Create component
- [ ] Add invite link generation
- [ ] Add copy functionality
- [ ] Add share buttons
- [ ] Add styling

#### 2.5.2 Engagement Rewards Status Card
**File**: `apps/web/src/components/gooddollar/engagement-rewards-card.tsx`

Features:
- Show if user is eligible
- Show if user has claimed
- Show potential rewards
- Set inviter address
- Claim status

**Tasks**:
- [ ] Create component
- [ ] Display eligibility status
- [ ] Display claim status
- [ ] Add inviter input/set
- [ ] Add styling

#### 2.5.3 Rewards Claim Banner
**File**: `apps/web/src/components/gooddollar/rewards-banner.tsx`

Features:
- Show banner when user can claim rewards
- Appear after first stream creation
- Link to claim flow

**Tasks**:
- [ ] Create component
- [ ] Add conditional rendering
- [ ] Add claim CTA
- [ ] Add styling

---

### 2.6 Integrate with Stream Creation Flow
**File**: `apps/web/src/components/streams/create-stream-form.tsx`

Modifications:
1. **Add Inviter Input** (optional):
   - Text input for inviter address
   - Validate address format
   - Store in component state

2. **Check Registration Status**:
   - Use `useEngagementRewards` hook
   - Check if user needs signature
   - Generate signature if needed

3. **Prepare Transaction**:
   - Get current block number
   - Calculate `validUntilBlock` (current + 600)
   - Generate signature if first-time user
   - Include signature in transaction

4. **Update Transaction Call**:
   - Add `inviter` parameter (or address(0))
   - Add `validUntilBlock` parameter
   - Add `signature` parameter

**Tasks**:
- [ ] Add inviter input field
- [ ] Integrate engagement rewards hook
- [ ] Generate signature before transaction
- [ ] Update transaction parameters
- [ ] Handle errors gracefully

---

### 2.7 Integrate with Withdrawal Flow
**File**: `apps/web/src/components/streams/withdraw-button.tsx` or similar

Modifications:
- Check if recipient is claiming for first time
- Generate signature if needed
- Include in withdrawal transaction

**Tasks**:
- [ ] Check first-time recipient status
- [ ] Generate signature if needed
- [ ] Update withdrawal transaction

---

### 2.8 Add Inviter Setting Page/Component
**File**: `apps/web/src/components/gooddollar/set-inviter-form.tsx`

Features:
- Input field for inviter address
- Validation
- Call `setInviter` on DripCore contract
- Show success/error states

**Tasks**:
- [ ] Create form component
- [ ] Add validation
- [ ] Add contract interaction
- [ ] Add success/error handling

---

### 2.9 Update Dashboard/Home Page
**File**: `apps/web/src/app/page.tsx` or dashboard component

Add:
- Engagement rewards status card
- Invite link card
- Rewards banner (if eligible)

**Tasks**:
- [ ] Add components to dashboard
- [ ] Add conditional rendering
- [ ] Style integration

---

## 📋 Phase 3: Testing & Deployment

### 3.1 Contract Testing
**File**: `apps/contracts/test/EngagementRewards.test.ts`

Test Cases:
- [ ] Setting engagement rewards contract
- [ ] Enabling/disabling rewards
- [ ] Setting inviter
- [ ] Claiming reward on first stream creation
- [ ] Claiming reward on first stream received
- [ ] Handling failed claims (non-blocking)
- [ ] Preventing duplicate claims
- [ ] Only owner can set engagement rewards

**Tasks**:
- [ ] Create test file
- [ ] Write test cases
- [ ] Run tests
- [ ] Fix any issues

---

### 3.2 Frontend Testing
- [ ] Test invite link generation
- [ ] Test signature generation
- [ ] Test stream creation with rewards
- [ ] Test withdrawal with rewards
- [ ] Test inviter setting
- [ ] Test error handling

**Tasks**:
- [ ] Manual testing on dev environment
- [ ] Test on Celo Sepolia
- [ ] Test error scenarios

---

### 3.3 Deployment Checklist

#### Smart Contracts:
- [ ] Deploy updated DripCore to testnet
- [ ] Verify contracts on Sourcify
- [ ] Register app in EngagementRewards contract (dev)
- [ ] Test on testnet
- [ ] Deploy to mainnet
- [ ] Register app in EngagementRewards contract (production)
- [ ] Enable engagement rewards

#### Frontend:
- [ ] Update environment variables
- [ ] Build and test locally
- [ ] Deploy to staging
- [ ] Test on staging
- [ ] Deploy to production

---

## 📋 Phase 4: Documentation & Monitoring

### 4.1 Documentation
- [ ] Update README with engagement rewards info
- [ ] Document how to set inviter
- [ ] Document reward claiming flow
- [ ] Document contract addresses

### 4.2 Monitoring
- [ ] Add events monitoring for reward claims
- [ ] Track claim success/failure rates
- [ ] Monitor gas costs
- [ ] Set up alerts for failures

---

## 🔧 Configuration

### Environment Variables

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_ENGAGEMENT_REWARDS_ENV=dev  # or "production"
NEXT_PUBLIC_ENGAGEMENT_REWARDS_CONTRACT_DEV=0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465
NEXT_PUBLIC_ENGAGEMENT_REWARDS_CONTRACT_PROD=0x25db74CF4E7BA120526fd87e159CF656d94bAE43
```

**Contracts** (`.env`):
```env
ENGAGEMENT_REWARDS_CONTRACT=0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465
```

---

## 🎯 Integration Points Summary

### Smart Contract Functions to Modify:
1. `createStream()` - Add reward claiming for first-time creators
2. `withdraw()` - Add reward claiming for first-time recipients
3. Add `setInviter()` - Allow users to set their inviter
4. Add `setEngagementRewards()` - Owner can set contract address
5. Add `setEngagementRewardsEnabled()` - Owner can enable/disable

### Frontend Components to Create:
1. `useEngagementRewards` hook
2. `InviteLinkCard` component
3. `EngagementRewardsCard` component
4. `RewardsBanner` component
5. `SetInviterForm` component

### Frontend Flows to Modify:
1. Stream creation flow - Add inviter input and signature generation
2. Withdrawal flow - Add signature generation for first-time recipients
3. Dashboard - Add rewards status and invite link

---

## ⚠️ Important Considerations

1. **Non-blocking**: Reward claims should never block core functionality
2. **Gas Costs**: Users pay gas for reward claims - consider UX implications
3. **Signature Validity**: Signatures are valid for 600 blocks (~2 hours on Celo)
4. **User Experience**: Make reward claiming optional and clear
5. **Security**: Validate all inputs, especially inviter addresses
6. **Testing**: Test thoroughly on dev environment before production

---

## 📅 Estimated Timeline

- **Phase 1 (Smart Contracts)**: 4-6 hours
- **Phase 2 (Frontend)**: 6-8 hours
- **Phase 3 (Testing)**: 3-4 hours
- **Phase 4 (Documentation)**: 1-2 hours

**Total**: ~14-20 hours

---

## 🚀 Next Steps

1. Review and approve this plan
2. Start with Phase 1.1 (Create Interface)
3. Proceed sequentially through phases
4. Test thoroughly before production deployment

