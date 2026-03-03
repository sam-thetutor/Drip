# Engagement Rewards: User Registration Method

## Answer: No Separate Registration Method

**There is NO separate method to register users in the Engagement Rewards contract.**

User registration happens **automatically** when `appClaim()` is called with a valid EIP-712 signature.

## How Registration Works

### Single Method: `appClaim()`

The Engagement Rewards contract has only one method for user interaction:

```solidity
function appClaim(
    address user,
    address inviter,
    uint256 validUntilBlock,
    bytes memory signature
) external returns (bool success);
```

### Registration Flow

1. **First-Time User (Not Registered):**
   ```
   User provides EIP-712 signature
   ↓
   App calls appClaim(user, inviter, validUntilBlock, signature)
   ↓
   Contract verifies signature
   ↓
   Contract registers user automatically
   ↓
   Emits UserRegistered(app, user) event
   ↓
   Processes reward claim
   ```

2. **Registered User:**
   ```
   App calls appClaim(user, inviter, validUntilBlock, "0x")
   ↓
   Contract checks: user is already registered
   ↓
   Skips registration (no UserRegistered event)
   ↓
   Processes reward claim
   ```

## Why No Separate Method?

### Design Rationale

1. **Simplified UX:**
   - Users don't need a separate registration step
   - Registration happens as part of the first claim
   - One transaction instead of two

2. **Atomic Operation:**
   - Registration and claim happen in one transaction
   - Either both succeed or both fail
   - No partial states

3. **Signature as Authorization:**
   - EIP-712 signature serves dual purpose:
     - Proves user authorizes the app
     - Proves user wants to register
   - No need for separate registration call

## Available Methods

### Public/View Methods

```solidity
// Check if user is registered
function isUserRegistered(address app, address user) external view returns (bool);

// Check if user can claim
function canClaim(address app, address user) external view returns (bool);

// Get last claim time
function lastClaimed(address app, address user) external view returns (uint256);

// Get cooldown period
function cooldownPeriod() external view returns (uint256);
```

### State-Changing Methods

```solidity
// Only method that registers users (when called with signature)
function appClaim(
    address user,
    address inviter,
    uint256 validUntilBlock,
    bytes memory signature
) external returns (bool);
```

**Note:** There is no `registerUser()` or `register()` method.

## Registration Detection

### How to Know if User is Registered

1. **Check Before Calling:**
   ```typescript
   const isRegistered = await engagementRewards.isUserRegistered(appAddress, userAddress);
   
   if (!isRegistered) {
     // Generate signature for first-time registration
     const signature = await signClaim(appAddress, inviter, validUntilBlock);
   } else {
     // Use empty signature
     const signature = "0x";
   }
   ```

2. **Listen to Events:**
   ```typescript
   // Listen for UserRegistered event
   const filter = engagementRewards.filters.UserRegistered(appAddress, userAddress);
   const events = await engagementRewards.queryFilter(filter);
   
   if (events.length > 0) {
     // User is registered
   }
   ```

3. **Check After Claim:**
   ```typescript
   // After calling appClaim(), check if UserRegistered event was emitted
   const receipt = await tx.wait();
   const userRegisteredEvent = receipt.logs.find(
     log => log.eventName === 'UserRegistered'
   );
   ```

## Implementation in Your Code

### Current Implementation (Correct)

Your code already handles this correctly:

```typescript
// From create-stream-form.tsx
const needsSignature = isUserRegistered === false;

if (needsSignature) {
  // Generate signature for registration
  signature = await signClaim(inviter, validUntilBlock);
} else {
  // User already registered, use empty signature
  signature = "0x";
}

// Call appClaim - registration happens automatically if signature is valid
await createStream(..., { signature });
```

### What Happens Internally

When `appClaim()` is called:

1. **Contract checks:** Is user registered?
   - If YES → Skip registration, process claim
   - If NO → Continue to step 2

2. **Contract checks:** Is signature provided?
   - If NO → Revert ("User not registered")
   - If YES → Continue to step 3

3. **Contract verifies:** Is signature valid?
   - If NO → Revert ("Invalid signature")
   - If YES → Continue to step 4

4. **Contract registers user:**
   - Stores user in contract storage
   - Emits `UserRegistered(app, user)` event
   - Continues to step 5

5. **Contract processes claim:**
   - Checks cooldown period
   - Checks eligibility
   - Distributes rewards
   - Emits `AppClaim(app, user, inviter, userReward, inviterReward, appReward)` event

## Summary

| Question | Answer |
|----------|--------|
| **Separate registration method?** | ❌ No |
| **How to register?** | Call `appClaim()` with valid signature |
| **When does registration happen?** | Automatically on first `appClaim()` call |
| **Can I register without claiming?** | ❌ No, registration is tied to first claim |
| **How to check if registered?** | Use `isUserRegistered(app, user)` |

## Key Takeaway

**Registration is not a separate action** - it's an automatic side effect of calling `appClaim()` with a valid signature for the first time. This design simplifies the user experience by combining registration and the first reward claim into a single transaction.

