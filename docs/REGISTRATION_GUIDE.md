# Engagement Rewards Registration Guide

## Current Status

- **Proxy Address**: `0x5530975fDe062FE6706298fF3945E3d1a17A310a`
- **Implementation Address**: `0xf3d26607342213Bf894f9146D08D0dfe4aAf6C5b`
- **Engagement Rewards Contract**: `0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465` (DEV)

## Issue

When DripCore calls `engagementRewards.appClaim()`, the call originates from the **proxy address**. However, the Engagement Rewards contract might be checking the implementation address or having issues with proxy contracts.

## Solution Options

### Option 1: Register Implementation Address (Recommended to Try)

1. Go to: https://engagement-rewards-dev.vercel.app
2. Connect your wallet
3. Register the **IMPLEMENTATION** address: `0xf3d26607342213Bf894f9146D08D0dfe4aAf6C5b`
4. Wait for approval (dev contract auto-approves)

**Note**: This might work if the Engagement Rewards contract checks the implementation address of proxy contracts.

### Option 2: Register Both Addresses

Register both:
- Proxy: `0x5530975fDe062FE6706298fF3945E3d1a17A310a`
- Implementation: `0xf3d26607342213Bf894f9146D08D0dfe4aAf6C5b`

### Option 3: User Signature Required

The error "User not registered for app" might also mean:
- The user needs to sign a message for first-time registration with DripCore
- Even if verified on Good Dollar, users need to register with each app
- Generate signature using `@goodsdks/engagement-sdk`:
  ```typescript
  const signature = await engagementRewards.signClaim(
    DripCoreAddress,
    inviterAddress,
    validUntilBlock
  );
  ```

## Testing After Registration

After registering the implementation address, test again:

```bash
npx hardhat run scripts/test-full-flow.ts --network celo
```

## Current Error

```
EngagementRewardClaimFailed: User not registered for app
```

This could mean:
1. DripCore (proxy) is not registered in Engagement Rewards
2. DripCore implementation needs to be registered instead
3. User needs to sign a registration message (even if verified)

