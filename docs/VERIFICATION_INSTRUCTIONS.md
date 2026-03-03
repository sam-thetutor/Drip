# Good Dollar Identity Whitelist Verification

## User Address to Verify
**0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7**

## Prerequisites Status

✅ **PASSED:**
1. Smart contract verified on Sourcify
2. App registered and approved in EngagementRewards contract  
3. User has claimed from 0 other apps (< 3 app limit)

⚠️ **NEEDS VERIFICATION:**
4. User whitelisted in Identity contract - **This is the likely cause of "Unknown error"**

## How to Verify Whitelist Status

### Method 1: GoodWallet (https://goodwallet.xyz)
1. Visit: https://goodwallet.xyz
2. Click **"Sign In"** button
3. Connect your wallet with address: `0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7`
4. Check if you can:
   - See your verification status
   - Claim UBI (Universal Basic Income)
   - See "Whitelisted" or "Verified" status

### Method 2: GoodDollar App (https://gooddapp.org)
1. Visit: https://gooddapp.org
2. Click **"Connect to a wallet"** button
3. Connect your wallet with address: `0x85A4b09fb0788f1C549a68dC2EdAe3F97aeb5Dd7`
4. Navigate to the **"Claim"** section
5. Check if you're able to claim or see verification status

### Method 3: Using Your App's Identity Hook
Your app already has `useIdentitySDK` hook installed. You can:
1. Open your app
2. Connect the wallet
3. The hook will automatically check whitelist status
4. Check the `identityStatus.isWhitelisted` value

## What to Look For

### ✅ WHITELISTED:
- See "Verified" or "Whitelisted" status
- Able to claim UBI tokens
- See your Good Dollar balance
- **Engagement rewards should work!**

### ❌ NOT WHITELISTED:
- See "Not verified" or "Pending verification"
- Unable to claim UBI
- Error messages about verification
- **This causes "Unknown error" in engagement rewards**

## If Not Whitelisted

1. Complete the verification process on GoodWallet or GoodDollar
2. This may require:
   - Social verification (Facebook, Twitter, etc.)
   - Phone number verification
   - Face verification
   - Other identity checks
3. Wait for the whitelist status to update on-chain (may take a few minutes)
4. Once whitelisted, engagement rewards should work!

## Current Status Summary

- ✅ Signature generation: **WORKING CORRECTLY**
- ✅ Contract verification: **VERIFIED**
- ✅ App registration: **APPROVED**
- ✅ User app limit: **UNDER LIMIT (0/3)**
- ⚠️ User whitelist: **NEEDS VERIFICATION**

The "Unknown error" from engagement rewards is most likely because the user is **NOT whitelisted** in the Identity contract. Once whitelisted, engagement rewards should work!
