# DripCore `claimEngagementReward` Function - Integration Guide

## Overview

The `claimEngagementReward` function allows users to claim GoodDollar engagement rewards **directly** without needing to create streams or withdraw funds. This function was added in the latest contract upgrade.

**Contract Address (Celo Mainnet):** `0x5530975fDe062FE6706298fF3945E3d1a17A310a`  
**Current Implementation:** `0xC08F59693bB5600e2F0671168CcfdA2F41eF79Eb`  
**Feature:** First-time signature requirement with null signature support for repeat claims

---

## Function Signature

```solidity
function claimEngagementReward(
    address inviter,
    uint256 validUntilBlock,
    bytes memory signature
) external nonReentrant returns (bool success)
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `inviter` | `address` | Optional inviter/referrer address. Use `address(0)` if no inviter, or provide address to share rewards. If `address(0)`, uses stored inviter from `userInviter[msg.sender]` |
| `validUntilBlock` | `uint256` | **First claim:** Must be > current block. Recommended: `currentBlock + 600` (~2 hours). **Subsequent claims:** Can be `0` (validation skipped) |
| `signature` | `bytes` | **First claim:** User's cryptographic signature generated using GoodDollar SDK (required). **Subsequent claims:** Can be empty (`"0x"`) - validation skipped |

### Returns

- `bool success` - Returns `true` if claim succeeded, `false` if failed (doesn't revert)

---

## First-Time vs. Subsequent Claims

The contract automatically tracks whether a user has claimed before using the `hasClaimedDirectEngagementReward` mapping.

### First Claim (User's First Time)
✅ **Signature REQUIRED** - Must provide valid GoodDollar signature  
✅ **validUntilBlock REQUIRED** - Must be > current block number  
🔓 After first claim, user is marked in `hasClaimedDirectEngagementReward[user] = true`

```solidity
// First claim - MUST provide signature
await dripCore.claimEngagementReward(
  inviterAddress,
  validUntilBlock,  // Must be > current block
  signature         // Must be non-empty bytes
);
```

### Subsequent Claims (User Has Already Claimed)
✅ **Signature OPTIONAL** - Can pass empty signature (`"0x"`)  
✅ **validUntilBlock OPTIONAL** - Can pass `0`  
💰 **Gas savings** - Skips signature validation, lower gas cost

```solidity
// Subsequent claims - Can pass empty values
await dripCore.claimEngagementReward(
  inviterAddress,
  0,        // Optional - skips validation
  "0x"      // Optional - empty signature
);
```

---

## Application Logic Flow

### Frontend/App Decision Logic

```typescript
// 1. Check if user has claimed before
const hasClaimed = await dripCore.hasClaimedDirectEngagementReward(userAddress);

if (!hasClaimed) {
  // FIRST TIME - Generate signature
  console.log("First claim detected - generating signature...");
  const signature = await generateEngagementSignature(
    userPrivateKey,
    inviterAddress,
    "PRODUCTION"
  );
  
  // Call with full parameters
  await dripCore.claimEngagementReward(
    inviterAddress,
    validUntilBlock,
    signature
  );
} else {
  // ALREADY CLAIMED - Use empty values
  console.log("User already claimed - using null signature...");
  
  // Call with minimal parameters
  await dripCore.claimEngagementReward(
    inviterAddress,
    0,      // No validation
    "0x"    // Empty signature
  );
}
```

---

## How It Works (From Current Implementation)

Based on analyzing your `createStream` implementation in `test-stream-creation.ts`, here's how engagement rewards currently work:

### Step 1: Initialize GoodDollar SDK
```typescript
import { EngagementRewardsSDK } from "@goodsdks/engagement-sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";

// Setup viem clients
const account = privateKeyToAccount(userPrivateKey as `0x${string}`);
const publicClient = createPublicClient({
  chain: celo,
  transport: http("https://forno.celo.org"),
});
const walletClient = createWalletClient({
  chain: celo,
  transport: http("https://forno.celo.org"),
  account,
});

// Initialize SDK
const ENGAGEMENT_CONTRACT = "0x25db74CF4E7BA120526fd87e159CF656d94bAE43"; // Production
const engagementRewards = new EngagementRewardsSDK(
  publicClient,
  walletClient,
  ENGAGEMENT_CONTRACT
);
```

### Step 2: Get Valid Until Block
```typescript
// Get current block
const currentBlock = await engagementRewards.getCurrentBlockNumber();

// Calculate expiration (600 blocks ≈ 2 hours on Celo)
const validUntilBlock = currentBlock + 600n;
```

### Step 3: Generate Signature
```typescript
const DRIP_CORE = "0x5530975fDe062FE6706298fF3945E3d1a17A310a";
const inviterAddress = "0xYourInviterAddress"; // or address(0)

// Get app info for description
const appInfo = await engagementRewards.getAppInfo(DRIP_CORE);
const description = appInfo[9] as string;

// Prepare signature data
const { domain, types, message } = await engagementRewards.prepareClaimSignature(
  DRIP_CORE,
  inviterAddress,
  validUntilBlock,
  description
);

// Sign locally
const signature = await account.signTypedData({
  domain,
  types: types as any,
  primaryType: 'Claim',
  message: message as any,
});
```

### Step 4: Call Contract Function
```typescript
import { ethers } from "ethers";

// Setup ethers contract
const DripCoreABI = [...]; // Your DripCore ABI
const provider = new ethers.JsonRpcProvider("https://forno.celo.org");
const wallet = new ethers.Wallet(userPrivateKey, provider);
const dripCore = new ethers.Contract(DRIP_CORE, DripCoreABI, wallet);

// Call claimEngagementReward
const tx = await dripCore.claimEngagementReward(
  inviterAddress,      // inviter (or address(0))
  validUntilBlock,     // valid until block
  signature            // user signature
);

// Wait for confirmation
const receipt = await tx.wait();
console.log("Success!", receipt.hash);
```

---

## Complete Integration Script

Here's a ready-to-use script based on your current implementation:

```typescript
import { ethers } from "ethers";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { EngagementRewardsSDK } from "@goodsdks/engagement-sdk";

// Configuration
const DRIP_CORE_ADDRESS = "0x5530975fDe062FE6706298fF3945E3d1a17A310a";
const ENGAGEMENT_CONTRACT = "0x25db74CF4E7BA120526fd87e159CF656d94bAE43"; // Production
const RPC_URL = "https://forno.celo.org";

/**
 * Generate GoodDollar engagement signature (full flow)
 */
async function generateEngagementSignature(
  userPrivateKey: string,
  inviter: string = "0x0000000000000000000000000000000000000000",
  env: "DEV" | "PRODUCTION" = "PRODUCTION"
): Promise<{ signature: `0x${string}`; validUntilBlock: bigint }> {
  // 1) Setup viem clients
  const account = privateKeyToAccount(userPrivateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ chain: celo, transport: http(RPC_URL), account });

  // 2) Choose engagement contract by env
  const engagementContract = env === "PRODUCTION"
    ? ("0x25db74CF4E7BA120526fd87e159CF656d94bAE43" as Address)
    : ("0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465" as Address);

  const engagementRewards = new EngagementRewardsSDK(publicClient, walletClient, engagementContract);

  // 3) Get current block and set expiry (+600 blocks ≈ 2h)
  const currentBlock = await engagementRewards.getCurrentBlockNumber();
  const validUntilBlock = currentBlock + 600n;

  // 4) Get app description (SDK expects this value in the typed data)
  const appInfo = await engagementRewards.getAppInfo(DRIP_CORE_ADDRESS as Address);
  const description = appInfo[9] as string;

  // 5) Prepare EIP-712 typed data
  const { domain, types, message } = await engagementRewards.prepareClaimSignature(
    DRIP_CORE_ADDRESS as Address,
    inviter as Address,
    validUntilBlock,
    description
  );

  // 6) Sign locally with the user's key
  const signature = await account.signTypedData({
    domain,
    types: types as any,
    primaryType: "Claim",
    message: message as any,
  });

  return { signature: signature as `0x${string}`, validUntilBlock };
}

/**
 * Claim engagement reward directly with first-time signature logic
 */
async function claimEngagementReward(
  userPrivateKey: string,
  inviterAddress: string = "0x0000000000000000000000000000000000000000"
) {
  console.log("=== Claiming Engagement Reward ===\n");

  // 1. Setup viem clients for signature generation
  const account = privateKeyToAccount(userPrivateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: celo,
    transport: http(RPC_URL),
  });
  const walletClient = createWalletClient({
    chain: celo,
    transport: http(RPC_URL),
    account,
  });

  // 2. Initialize GoodDollar SDK
  const engagementRewards = new EngagementRewardsSDK(
    publicClient,
    walletClient,
    ENGAGEMENT_CONTRACT as Address
  );

  console.log("User Address:", account.address);
  console.log("Inviter:", inviterAddress);

  // 3. Setup ethers contract to check if user has claimed before
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(userPrivateKey, provider);
  
  const DripCoreABI = [
    "function hasClaimedDirectEngagementReward(address user) public view returns (bool)",
    "function claimEngagementReward(address inviter, uint256 validUntilBlock, bytes memory signature) external returns (bool success)",
    "event EngagementRewardClaimed(address indexed user, address indexed inviter, bool success)",
    "event EngagementRewardClaimFailed(address indexed user, string reason)"
  ];
  
  const dripCore = new ethers.Contract(DRIP_CORE_ADDRESS, DripCoreABI, wallet);

  // 4. Check if user has claimed before
  console.log("\n=== Checking Claim Status ===");
  const hasClaimed = await dripCore.hasClaimedDirectEngagementReward(account.address);
  console.log("Has claimed before:", hasClaimed);

  let validUntilBlock: bigint = 0n;
  let signature: string = "0x";

  if (!hasClaimed) {
    // FIRST CLAIM - Must generate signature
    console.log("\n⚠️  FIRST CLAIM DETECTED - Signature required\n");

    // Get current block and calculate expiration
    const currentBlock = await engagementRewards.getCurrentBlockNumber();
    validUntilBlock = currentBlock + 600n; // ~2 hours
    
    console.log("Block Info:");
    console.log("  Current Block:", currentBlock.toString());
    console.log("  Valid Until:", validUntilBlock.toString());
    console.log("  Validity:", "~2 hours (600 blocks)");

    // Generate signature
    console.log("\nGenerating signature...");
    try {
      const sig = await generateEngagementSignature(
        userPrivateKey,
        inviterAddress,
        "PRODUCTION"
      );
      signature = sig.signature;
      console.log("✅ Signature generated");
      console.log("   Length:", signature.length, "characters");
    } catch (error: any) {
      console.error("❌ Signature generation failed:", error.message);
      throw error;
    }
  } else {
    // SUBSEQUENT CLAIMS - Can use empty values
    console.log("\n✅ USER ALREADY CLAIMED - Using null signature\n");
    console.log("Skipping signature generation (already claimed)");
    console.log("Using empty values:");
    console.log("  validUntilBlock: 0");
    console.log("  signature: 0x");
    
    validUntilBlock = 0n;
    signature = "0x";
  }

  // 5. Send transaction
  console.log("\n=== Sending Transaction ===");
  console.log("Calling claimEngagementReward with:");
  console.log("  Inviter:", inviterAddress);
  console.log("  validUntilBlock:", validUntilBlock.toString());
  console.log("  signature:", signature === "0x" ? "(empty)" : "(generated)");

  // 6. Estimate gas (optional but recommended)
  try {
    const gasEstimate = await dripCore.claimEngagementReward.estimateGas(
      inviterAddress,
      validUntilBlock,
      signature
    );
    console.log("  Estimated gas:", gasEstimate.toString());
    
    // Add 50% buffer
    const gasLimit = (gasEstimate * 150n) / 100n;
    console.log("  Gas limit (with buffer):", gasLimit.toString());
  } catch (error: any) {
    console.log("  Gas estimation failed (will use default)");
  }

  // 8. Send transaction
  const tx = await dripCore.claimEngagementReward(
    inviterAddress,
    validUntilBlock,
    signature,
    { gasLimit: 500000 } // Safe default
  );

  console.log("\nTransaction sent:", tx.hash);
  console.log("Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log("✅ Transaction confirmed!");
  console.log("   Block:", receipt.blockNumber);
  console.log("   Gas Used:", receipt.gasUsed.toString());

  // 9. Parse events
  console.log("\n=== Events ===");
  let claimSuccess = false;
  
  for (const log of receipt.logs) {
    try {
      const parsed = dripCore.interface.parseLog(log);
      
      if (parsed?.name === "EngagementRewardClaimed") {
        console.log("✅ EngagementRewardClaimed");
        console.log("   User:", parsed.args[0]);
        console.log("   Inviter:", parsed.args[1]);
        console.log("   Success:", parsed.args[2]);
        claimSuccess = parsed.args[2];
        
        if (claimSuccess) {
          console.log("\n🎉 REWARD CLAIMED SUCCESSFULLY!");
        } else {
          console.log("\n⚠️  Claim returned false (cooldown or restrictions)");
        }
      } else if (parsed?.name === "EngagementRewardClaimFailed") {
        console.log("❌ EngagementRewardClaimFailed");
        console.log("   User:", parsed.args[0]);
        console.log("   Reason:", parsed.args[1]);
      }
    } catch (e) {
      // Not a DripCore event
    }
  }

  return claimSuccess;
}

// Example usage
const USER_PRIVATE_KEY = process.env.PRIVATE_KEY || "0x...";
const INVITER_ADDRESS = process.env.INVITER_ADDRESS || "0x0000000000000000000000000000000000000000";

claimEngagementReward(USER_PRIVATE_KEY, INVITER_ADDRESS)
  .then((success) => {
    console.log("\n=== Result ===");
    console.log("Claim successful:", success);
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  });
```

---

## Requirements

### Dependencies
```json
{
  "dependencies": {
    "@goodsdks/engagement-sdk": "^1.0.0",
    "ethers": "^6.x",
    "viem": "^2.x"
  }
}
```

### Environment Variables
```bash
# User's wallet private key
PRIVATE_KEY=0x...

# Optional inviter address (defaults to zero address)
INVITER_ADDRESS=0x...

# Celo RPC URL
CELO_RPC_URL=https://forno.celo.org
```

---

## Contract Requirements

Before calling this function, ensure:

1. **Engagement Rewards Enabled**
   ```solidity
   bool public engagementRewardsEnabled; // Must be true
   ```

2. **Engagement Contract Set**
   ```solidity
   address public engagementRewards; // Must be set to GoodDollar contract
   ```

3. **Signature Not Expired**
   - `validUntilBlock` must be > current block number

---

## Events Emitted

```solidity
// On successful claim
event EngagementRewardClaimed(
    address indexed user,
    address indexed inviter,
    bool success
);

// On failed claim
event EngagementRewardClaimFailed(
    address indexed user,
    string reason
);
```

---

## Error Handling

The function uses try-catch internally and **never reverts**. It returns:
- `true` - Claim succeeded
- `false` - Claim failed (check events for reason)

External validation errors that **do revert** (only on first claim):
```solidity
// On first claim only:
require(validUntilBlock > block.number, "DripCore: Signature expired (first claim requires valid block)");
require(signature.length > 0, "DripCore: Signature required on first claim");

// Always checked:
require(engagementRewardsEnabled, "DripCore: Engagement rewards disabled");
require(address(engagementRewards) != address(0), "DripCore: No rewards contract");
```

---

## Smart Contract Logic

The contract automatically handles first-time vs. subsequent claims:

```solidity
// On first claim
if (!hasClaimedDirectEngagementReward[msg.sender]) {
    require(validUntilBlock > block.number, "..."); // ENFORCED
    require(signature.length > 0, "...");           // ENFORCED
}

// Mark user as claimed after first attempt
hasClaimedDirectEngagementReward[msg.sender] = true;
```

This means:
- **First call:** Must provide valid signature + block
- **After first call:** Can pass `0` and `0x` (empty values)
- **Marking:** Happens on first attempt, even if it fails

---

## Implementation Plan for Other Apps

### Step 1: Install Dependencies
```bash
npm install @goodsdks/engagement-sdk ethers viem
```

### Step 2: Copy Utility Functions
Copy the signature generation logic from:
- `/apps/contracts/scripts/utils/engagement-signature.ts`

Or use the standalone script provided above.

### Step 3: Integrate into Your App

**Backend/Script Integration:**
```typescript
// Call from Node.js script
import { claimEngagementReward } from './claim-reward';

await claimEngagementReward(userPrivateKey, inviterAddress);
```

**Frontend Integration:**
```typescript
// Use wagmi/viem hooks
import { useAccount, useWriteContract } from 'wagmi';

const { writeContract } = useWriteContract();

// Generate signature (same as above)
const signature = await generateSignature(...);

// Call contract
await writeContract({
  address: DRIP_CORE_ADDRESS,
  abi: DripCoreABI,
  functionName: 'claimEngagementReward',
  args: [inviterAddress, validUntilBlock, signature],
});
```

### Step 4: Test
```bash
# Run the script
ts-node claim-engagement-reward.ts

# Or with environment variables
PRIVATE_KEY=0x... INVITER_ADDRESS=0x... ts-node claim-engagement-reward.ts
```

---

## Comparison: Old vs New

### Old Way (Embedded in Stream Creation)
```typescript
// Had to create a stream to claim rewards
const tx = await dripCore.createStream(
  recipients,
  token,
  amounts,
  period,
  deposit,
  title,
  description,
  inviter,      // Engagement params
  validUntil,   // Engagement params
  signature     // Engagement params
);
```

### New Way (Direct Claim)
```typescript
// Claim rewards independently
const tx = await dripCore.claimEngagementReward(
  inviter,
  validUntil,
  signature
);
```

**Benefits:**
- ✅ No need to create streams
- ✅ Can claim anytime
- ✅ Lower gas costs (no stream creation)
- ✅ Simpler integration
- ✅ Better UX for users who just want rewards

---

## Testing

Use the provided test script:
```bash
cd apps/contracts
npx hardhat run scripts/test-claim-engagement-reward.ts --network celo
```

Or create your own test:
```bash
# Create test file
touch test-claim.ts

# Add the script content above
# Run it
ts-node test-claim.ts
```

---

## Support & Resources

- **Contract Explorer:** https://celoscan.io/address/0x5530975fDe062FE6706298fF3945E3d1a17A310a
- **GoodDollar Docs:** https://docs.gooddollar.org/
- **Engagement SDK:** https://github.com/GoodDollar/GoodDAPP/tree/master/packages/sdk-v2
- **Celo Docs:** https://docs.celo.org/

---

## Troubleshooting

### Issue: "Signature expired"
**Solution:** Regenerate signature with fresh `validUntilBlock`

### Issue: "Engagement rewards disabled"
**Solution:** Contact contract owner to enable via `setEngagementRewardsEnabled(true)`

### Issue: "No rewards contract"
**Solution:** Contract owner must set rewards contract via `setEngagementRewards(address)`

### Issue: Claim returns false
**Solution:** User may be on cooldown or already claimed. Check GoodDollar contract for details.

---

## Security Notes

1. **Never expose private keys** - Use environment variables
2. **Validate signatures** - Always check signature generation succeeded
3. **Check block numbers** - Ensure `validUntilBlock` is reasonable
4. **Monitor events** - Always check transaction events for actual success
5. **Rate limiting** - GoodDollar has claim cooldowns, respect them

---

**Last Updated:** January 22, 2026 
