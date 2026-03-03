# UserRegistered Event - Detailed Analysis

## Event Signature

```solidity
event UserRegistered(address indexed app, address indexed user);
```

## When is it Emitted?

The `UserRegistered` event is emitted when a user registers with an app for the **first time** in the Engagement Rewards contract.

### Trigger Conditions

1. **First-Time Registration:**
   - User has never interacted with this specific app before
   - User is not yet registered in the Engagement Rewards contract for this app

2. **Valid Signature Provided:**
   - User provides an EIP-712 typed data signature
   - Signature authorizes the app to claim rewards on their behalf
   - Signature includes:
     - App address
     - User address
     - Inviter address (can be zero)
     - Valid until block number
     - App description (from app registration)

3. **App Calls `appClaim()`:**
   - App calls `engagementRewards.appClaim(user, inviter, validUntilBlock, signature)`
   - Contract verifies the signature
   - If valid, contract registers the user and emits `UserRegistered` event

## Event Parameters

### `app` (address, indexed)
- **Type:** `address` (indexed for filtering)
- **Description:** Address of the app that the user is registering with
- **Example:** `0x5530975fDe062FE6706298fF3945E3d1a17A310a` (DripCore)

### `user` (address, indexed)
- **Type:** `address` (indexed for filtering)
- **Description:** Address of the user being registered
- **Example:** `0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7`

## Registration Flow

### Step-by-Step Process

1. **User Interaction:**
   ```
   User → Creates stream or withdraws from stream
   ```

2. **Check Registration Status:**
   ```typescript
   const isRegistered = await engagementRewards.isUserRegistered(appAddress, userAddress);
   ```

3. **If Not Registered:**
   - Frontend generates EIP-712 signature using user's wallet
   - Signature includes app address, user address, inviter, validUntilBlock
   - Signature proves user authorizes the app

4. **App Calls `appClaim()`:**
   ```solidity
   engagementRewards.appClaim(
       user,           // User address
       inviter,        // Inviter address (can be zero)
       validUntilBlock, // Block number until signature is valid
       signature       // EIP-712 signature
   )
   ```

5. **Contract Processing:**
   - Verifies signature is valid
   - Checks signature hasn't expired (validUntilBlock > current block)
   - Registers user in contract storage
   - Emits `UserRegistered(app, user)` event
   - Processes the reward claim

6. **If Already Registered:**
   - No signature needed (can use empty bytes `0x`)
   - Contract checks cooldown period
   - Processes reward claim directly
   - No `UserRegistered` event emitted (already registered)

## What Happens After Registration?

### Immediate Effects

1. **User is Registered:**
   - User is now in the contract's storage
   - App can claim rewards for this user
   - User is linked to the app

2. **Subsequent Claims:**
   - No signature required (can use empty bytes `0x`)
   - User can claim rewards every cooldown period (180 days)
   - App can call `appClaim()` without user signature

3. **Cooldown Period:**
   - User can claim rewards once per 180 days per app
   - Cooldown is tracked per app-user pair
   - After cooldown expires, user can claim again

### Registration Persistence

- **Permanent:** Once registered, user stays registered
- **Per-App:** Registration is specific to each app
- **Cannot Unregister:** Users cannot unregister (by design)

## Use Cases

### 1. User Onboarding Tracking

```typescript
// Count how many users have registered with your app
const filter = engagementRewards.filters.UserRegistered(appAddress);
const events = await engagementRewards.queryFilter(filter, fromBlock, toBlock);
const totalUsers = events.length;
```

### 2. User Adoption Metrics

- Track which users have authorized your app
- Measure user onboarding rate
- Identify power users (users who register early)

### 3. Analytics Dashboard

- Show total registered users per app
- Display registration timeline
- Compare registration rates across apps

### 4. Reward Eligibility

- Check if user is registered before attempting claim
- Determine if signature is needed
- Optimize UX (don't ask for signature if already registered)

## Relationship with Other Events

### UserRegistered vs AppClaim

**UserRegistered:**
- Emitted **once** per user per app
- Emitted on first registration only
- Does NOT include reward amounts
- Just confirms registration happened

**AppClaim:**
- Emitted **every time** a reward is successfully claimed
- Can be emitted multiple times per user (after cooldown)
- **Includes reward amounts** (userReward, inviterReward, appReward)
- Shows actual reward distribution

### Typical Flow

```
1. First Claim (with signature):
   UserRegistered(app, user)  ← Registration
   AppClaim(app, user, inviter, userReward, inviterReward, appReward)  ← First reward

2. Subsequent Claims (no signature):
   AppClaim(app, user, inviter, userReward, inviterReward, appReward)  ← More rewards
   (No UserRegistered event - already registered)
```

## Querying UserRegistered Events

### Using viem

```typescript
import { createPublicClient, http } from 'viem';
import { celo } from 'viem/chains';

const publicClient = createPublicClient({
  chain: celo,
  transport: http('https://forno.celo.org'),
});

// Get all UserRegistered events for your app
const events = await publicClient.getLogs({
  address: ENGAGEMENT_REWARDS_CONTRACT,
  event: {
    type: 'event',
    name: 'UserRegistered',
    inputs: [
      { name: 'app', type: 'address', indexed: true },
      { name: 'user', type: 'address', indexed: true },
    ],
  },
  args: {
    app: YOUR_APP_ADDRESS, // Filter by your app
  },
  fromBlock: deploymentBlock,
  toBlock: 'latest',
});

console.log(`Total registered users: ${events.length}`);
```

### Filtering Options

1. **By App:**
   ```typescript
   args: { app: YOUR_APP_ADDRESS }
   ```

2. **By User:**
   ```typescript
   args: { user: USER_ADDRESS }
   ```

3. **By Both:**
   ```typescript
   args: { app: YOUR_APP_ADDRESS, user: USER_ADDRESS }
   ```

## Important Notes

### 1. One-Time Event
- `UserRegistered` is emitted **only once** per user per app
- If you miss the event, you can check registration status using `isUserRegistered()`

### 2. Registration vs Verification
- **Registration** (UserRegistered): User authorizes app to claim rewards
- **Verification** (GoodDollar Identity): User verifies identity (separate system)
- User must be **verified** to claim rewards, but **registration** is per-app

### 3. Signature Requirements
- **First claim:** Requires EIP-712 signature
- **Subsequent claims:** Can use empty signature (`0x`)
- Signature must be valid and not expired

### 4. App Re-Registration
- If app is re-registered (new application), users may need to register again
- Check `isUserRegistered()` after app re-registration

## Example: Tracking User Registrations

```typescript
// Service to track user registrations
export async function trackUserRegistrations(appAddress: string) {
  const publicClient = createPublicClient({
    chain: celo,
    transport: http('https://forno.celo.org'),
  });

  // Get all UserRegistered events for your app
  const events = await publicClient.getLogs({
    address: ENGAGEMENT_REWARDS_CONTRACT,
    event: {
      type: 'event',
      name: 'UserRegistered',
      inputs: [
        { name: 'app', type: 'address', indexed: true },
        { name: 'user', type: 'address', indexed: true },
      ],
    },
    args: {
      app: appAddress as `0x${string}`,
    },
    fromBlock: 0n, // From contract deployment
    toBlock: 'latest',
  });

  // Store in database
  for (const event of events) {
    await db.insert('user_registrations', {
      app_address: event.args.app,
      user_address: event.args.user,
      registered_at_block: event.blockNumber,
      registered_at_tx: event.transactionHash,
      registered_at: new Date(), // Get from block timestamp
    });
  }

  return {
    totalRegistrations: events.length,
    uniqueUsers: new Set(events.map(e => e.args.user)).size,
  };
}
```

## Summary

The `UserRegistered` event is a **one-time event** that marks when a user first authorizes an app to claim Engagement Rewards on their behalf. It's emitted when:

1. User provides a valid EIP-712 signature
2. App calls `appClaim()` with the signature
3. Contract verifies and registers the user

After registration, users can claim rewards without signatures (using empty bytes), but must wait for the cooldown period (180 days) between claims.

This event is useful for:
- Tracking user onboarding
- Measuring app adoption
- Understanding user engagement
- Building analytics dashboards

