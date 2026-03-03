# Error Analysis: Why "Unknown error" is Triggered

## Current Situation

The `_tryClaimEngagementReward` function has this error handling:

```solidity
try engagementRewards.appClaim(...) returns (bool success) {
    // Handle success
} catch Error(string memory reason) {
    emit EngagementRewardClaimFailed(user, reason);
} catch {
    emit EngagementRewardClaimFailed(user, "Unknown error");
}
```

## What Triggers the Generic Catch Block?

Based on the script output (`decode-error-type.ts`), the Engagement Rewards contract throws `Error(string)` with selector `0x08c379a0`. This **should** be caught by `catch Error(string memory reason)`.

However, the generic `catch` block is triggered when:

1. **Custom Errors** (not `Error(string)`)
   - Modern Solidity contracts use custom errors like `error CustomError(uint256 code)`
   - These have different selectors and won't match `Error(string)`

2. **Panic Errors**
   - Arithmetic overflow/underflow
   - Array out of bounds
   - Division by zero
   - Selector: `0x4e487b71`

3. **Malformed Error Data**
   - If the error data is corrupted or incomplete
   - If the error format doesn't match `Error(string)` exactly

4. **Out of Gas**
   - If the external call runs out of gas during execution

5. **Low-level Call Failures**
   - If the external call fails in a way that doesn't return standard error data

## Why It Might Be Hitting Generic Catch

Even though the script shows `Error(string)`, when called from within DripCore's try-catch, it might:

1. **Be wrapped differently** - The proxy pattern might affect how errors propagate
2. **Have different context** - The call from DripCore might trigger a different code path
3. **Be a different error in some cases** - Maybe some conditions throw custom errors instead

## Solution

To properly decode errors, you need to:

1. **Catch `bytes memory lowLevelData`** instead of just generic catch
2. **Check the error selector** to determine the error type
3. **Decode based on the selector**:
   - `0x08c379a0` = `Error(string)` - decode the string
   - `0x4e487b71` = Panic error - decode the panic code
   - Other = Custom error - show the selector

However, the current contract has a "stack too deep" compilation error when trying to add this logic, likely because `_createStreamInternal` already uses too many local variables.

## Recommended Approach

Since the compilation is failing due to stack depth, consider:

1. **Extract error decoding to a library** - Move the error decoding logic to a separate library to reduce stack usage
2. **Simplify the error message** - Just show the error selector as hex without full decoding
3. **Use events with error data** - Emit the raw error data and decode it off-chain

The simplest fix that will work is to catch `bytes memory lowLevelData` and emit the first 4 bytes (error selector) as hex, which will tell you what type of error occurred without requiring complex decoding logic.

