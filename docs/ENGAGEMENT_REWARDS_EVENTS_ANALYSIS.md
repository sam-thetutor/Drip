# GoodDollar Engagement Rewards Contract Events Analysis

## Contract Addresses

- **DEV**: `0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465`
- **PRODUCTION**: `0x25db74CF4E7BA120526fd87e159CF656d94bAE43`

## Events Emitted by Engagement Rewards Contract

### 1. `AppRegistered`
**Emitted when:** An app registers with the Engagement Rewards contract

**Parameters:**
- `app` (address, indexed) - Address of the registered app
- `owner` (address, indexed) - Address of the app owner
- `receiver` (address) - Address that receives app rewards

**Use Case:** Track which apps are registered and who owns them

---

### 2. `AppClaim` ⭐ **MOST IMPORTANT**
**Emitted when:** A reward is successfully claimed

**Parameters:**
- `app` (address, indexed) - Address of the app making the claim
- `user` (address, indexed) - Address of the user receiving the reward
- `inviter` (address, indexed) - Address of the inviter (if any)
- `userReward` (uint256) - Amount of G$ tokens for user
- `inviterReward` (uint256) - Amount of G$ tokens for inviter
- `appReward` (uint256) - Amount of G$ tokens for app

**Use Case:** 
- **This is what the dashboard uses to show reward statistics!**
- Track exact reward amounts distributed
- Calculate total rewards per app
- Show user/inviter/app reward breakdowns

**Example from Dashboard:**
- Total Rewards: Sum of all `userReward + inviterReward + appReward` for an app
- User Share: Sum of all `userReward` for an app
- Inviter Share: Sum of all `inviterReward` for an app
- App Share: Sum of all `appReward` for an app
- Number of Events: Count of `AppClaim` events for an app

---

### 3. `UserRegistered`
**Emitted when:** A user registers with an app (first-time registration)

**Parameters:**
- `app` (address, indexed) - Address of the app
- `user` (address, indexed) - Address of the registered user

**Use Case:** Track user registrations per app

---

## Current Implementation Status

### ✅ What We Have

1. **DripCore Events:**
   - `EngagementRewardClaimed(address indexed user, address indexed inviter, bool success)`
   - `EngagementRewardClaimFailed(address indexed user, string reason)`

2. **Integration:**
   - DripCore calls `engagementRewards.appClaim()` on stream creation/withdrawal
   - Errors are caught and emitted as events

### ❌ What We're Missing

1. **Not Listening to Engagement Rewards Contract Events:**
   - We're not listening to the actual `AppClaim` events from the Engagement Rewards contract
   - We only track our own DripCore events which don't include reward amounts

2. **No Reward Amount Tracking:**
   - Our events don't include `userReward`, `inviterReward`, or `appReward` amounts
   - We can't calculate total rewards like the dashboard does

3. **No App Statistics:**
   - We can't show:
     - Total rewards distributed
     - User/Inviter/App share breakdowns
     - Number of successful claims
     - Reward distribution percentages

---

## How the Dashboard Works

Based on the screenshot showing registered apps with reward statistics:

1. **Dashboard queries `AppClaim` events** from the Engagement Rewards contract
2. **Filters by app address** to get all claims for a specific app
3. **Calculates statistics:**
   - Total Rewards = Sum of (userReward + inviterReward + appReward)
   - User Share = Sum of userReward
   - Inviter Share = Sum of inviterReward
   - App Share = Sum of appReward
   - Number of Events = Count of AppClaim events
   - Distribution = Calculated from percentages

---

## Recommendations

### Option 1: Listen to Engagement Rewards Contract Events (Recommended)

**Create a service to track `AppClaim` events:**

```typescript
// Track AppClaim events from Engagement Rewards contract
const appClaimEvents = await publicClient.getLogs({
  address: ENGAGEMENT_REWARDS_CONTRACT,
  event: {
    type: 'event',
    name: 'AppClaim',
    inputs: [
      { name: 'app', type: 'address', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'inviter', type: 'address', indexed: true },
      { name: 'userReward', type: 'uint256', indexed: false },
      { name: 'inviterReward', type: 'uint256', indexed: false },
      { name: 'appReward', type: 'uint256', indexed: false },
    ],
  },
  fromBlock: deploymentBlock,
  toBlock: 'latest',
});

// Store in database for analytics
// Calculate statistics like the dashboard
```

**Benefits:**
- Get exact reward amounts
- Track all claims (not just from DripCore)
- Match dashboard statistics
- Show comprehensive reward analytics

### Option 2: Enhance DripCore Events

**Add reward amounts to DripCore events:**

```solidity
event EngagementRewardClaimed(
    address indexed user,
    address indexed inviter,
    bool success,
    uint256 userReward,
    uint256 inviterReward,
    uint256 appReward
);
```

**Limitations:**
- Only tracks claims from DripCore
- Need to parse return value from `appClaim()` to get amounts
- More complex implementation

---

## Next Steps

1. **Create Event Listener Service:**
   - Listen to `AppClaim` events from Engagement Rewards contract
   - Store events in database
   - Calculate statistics

2. **Create Analytics Dashboard:**
   - Show total rewards distributed
   - Show user/inviter/app share breakdowns
   - Show number of claims
   - Match the GoodDollar dashboard format

3. **Add to Frontend:**
   - Display reward statistics
   - Show user's claim history
   - Show app's reward distribution

---

## Script to Query Events

I've created a script at `apps/web/scripts/check-engagement-rewards-events.ts` that:
- Lists all available events
- Queries recent events from both DEV and PROD contracts
- Shows event structure and parameters

Run it with:
```bash
cd apps/web
npx tsx scripts/check-engagement-rewards-events.ts
```

