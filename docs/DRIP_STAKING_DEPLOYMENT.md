# DripStaking Deployment Guide - GoodDollar Edition

Complete guide for deploying the production-ready DripStaking contract with GoodDollar on Celo mainnet.

**Based on:** [Superfluid Official Staking Example](https://github.com/superfluid-org/sf-example-staking)

## 📋 Prerequisites

- Private key with CELO and G$ tokens for deployment
- Node.js 18+
- pnpm package manager
- Hardhat configured for Celo

## 🔧 Step 1: Wrap GoodDollar as Super Token

GoodDollar needs to be wrapped as a Superfluid Super Token to work with Distribution Pools.

### Get your credentials ready:
```bash
export PRIVATE_KEY="your_private_key_here"
export CELO_RPC_URL="https://forno.celo.org"  # Already in hardhat config
```

### Wrap GoodDollar:
```bash
cd apps/contracts

# This creates a wrapped Super Token from G$
npx hardhat run scripts/wrap-gooddollar.ts --network celo
```

**Expected output:**
```
🌍 Connected to network: celo (Chain ID: 42220)
📝 Using account: 0x...
💰 GoodDollar balance: 100.5 G$

🔧 Wrapping GoodDollar as Super Token...
   Factory: 0x36be86dEe6BC726Ed0Cbd170ccD2F21760BC73D9
   Token: 0x765DE816845861e75A25fCA122bb6bEB168e28b1

📤 Transaction submitted: 0x...
⏳ Waiting for confirmation...
✅ Transaction confirmed in block 12345678

🎉 Super Token created: 0xABC123...
```

**Copy the Super Token address** - you'll need it next.

## 🎯 Step 2: Set Environment Variables

```bash
# The Super Token address from Step 1
export SUPER_GOOD_DOLLAR="0xABC123DEF456..."

# The address that will manage reward distribution
export REWARD_ADMIN_ADDRESS="0x123456..."

# Optional: Scaling factor (default: 1e15)
# Higher values = smaller units, better precision
# Recommended: 1e15 to 1e18
export SCALING_FACTOR="1000000000000000"

# Verify they're set
echo $SUPER_GOOD_DOLLAR
echo $REWARD_ADMIN_ADDRESS
```

## 🚀 Step 3: Deploy DripStaking Contract

```bash
cd apps/contracts

npx hardhat ignition deploy ignition/modules/DripStaking.ts --network celo
```

**Expected output:**
```
✔ Confirm you are signing with account: 0x...
✔ Confirm deployment of DripStaking module

  DripStaking#DripStakingModule - 0xDRIPSTAKING...
```

**Save the contract address** - this is your staking contract.

## 📊 Step 4: Create Reward Distribution Pool

Once deployed, create the distribution pool:

```bash
# Create a simple script to call the contract
cat > create-pool.js << 'EOF'
const { ethers } = require("ethers");

const DRIP_STAKING = "0x..."; // From Step 3
const provider = new ethers.JsonRpcProvider("https://forno.celo.org");
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const abi = [
  "function createRewardPool() external returns (address)"
];

const contract = new ethers.Contract(DRIP_STAKING, abi, signer);
contract.createRewardPool().then(tx => {
  console.log("Pool creation tx:", tx.hash);
});
EOF

node create-pool.js
```

Pool is now created and ready for staking!

## 💰 Step 5: Fund the Staking Contract

The contract needs Super Token balance to distribute rewards.

```bash
# Transfer wrapped GDx to the staking contract
# You'll need to have Super Token balance (from wrapping)
```

## 🎬 Step 6: Set Reward Flow Rate

The reward admin sets how many tokens per second to stream to stakers:

```bash
# For 1000 tokens per day: 1000 / 86400 ≈ 0.01157 tokens/second
# In wei (18 decimals): 11574074 wei/second (rounded)

cat > set-flow.js << 'EOF'
const { ethers } = require("ethers");

const DRIP_STAKING = "0x..."; // From Step 3
const FLOW_RATE = "11574074"; // ~1000 GDx per day

const provider = new ethers.JsonRpcProvider("https://forno.celo.org");
const signer = new ethers.Wallet(process.env.REWARD_ADMIN_ADDRESS, provider);

const abi = [
  "function setRewardFlowRate(int96 newFlowRate) external"
];

const contract = new ethers.Contract(DRIP_STAKING, abi, signer);
contract.setRewardFlowRate(FLOW_RATE).then(tx => {
  console.log("✅ Flow rate set:", tx.hash);
});
EOF

node set-flow.js
```

Rewards are now streaming into the pool!

## 📱 Usage: Staking Operations

### User Stakes Tokens:
```typescript
// Approve contract to spend Super Token
const approve = await superToken.approve(
  DRIP_STAKING_ADDRESS,
  ethers.parseUnits("100", 18)
);
await approve.wait();

// Stake
const stake = await dripStaking.stake(ethers.parseUnits("100", 18));
await stake.wait();

// Rewards start streaming immediately!
```

### User Checks Reward Rate:
```typescript
const [staked, claimed, rate] = await dripStaking.getStakeInfo(userAddress);
console.log(`Staked: ${ethers.formatUnits(staked, 18)} GDx`);
console.log(`Claimed: ${ethers.formatUnits(claimed, 18)} GDx`);
console.log(`Rate: ${rate} wei/second`);

// Get pool units
const units = await dripStaking.getPoolUnits(userAddress);
console.log(`Pool units: ${units}`);
```

### User Claims Rewards:
```typescript
const claimed = await dripStaking.claimRewards();
await claimed.wait();
```

### User Unstakes:
```typescript
const unstake = await dripStaking.unstake(ethers.parseUnits("50", 18));
await unstake.wait();
```

## 🔑 Key Contracts & Addresses

### Celo Mainnet (Chain ID: 42220)

| Component | Address |
|-----------|---------|
| GoodDollar (G$) | `0x765DE816845861e75A25fCA122bb6bEB168e28b1` |
| Super Token Factory | `0x36be86dEe6BC726Ed0Cbd170ccD2F21760BC73D9` |
| Superfluid Host | `0xA4Ff07cF81C02CFD356184879D953970cA957585` |

## ⚙️ Contract Configuration

### DripStaking Constructor:

```solidity
initialize(
  address _superToken,           // Wrapped GDx address  
  address _rewardAdmin,          // Admin for flow rate control
  uint128 _scalingFactor         // Unit calculation scale factor
)
```

### Scaling Factor Guide:

- **1e15**: Default, works well for most stake sizes
- **1e18**: Maximum precision, use for very small stakes
- **1e12**: Use for very large stakes (millions)

**Formula:** `pool_units = staked_amount / scaling_factor`

## 🎯 Example Flow

```
User stakes 1000 GDx
├─ Total staked now: 1000 GDx
├─ User units: 1000 / 1e15 = 1e-12 (in pool)
├─ Pool units updated
│
Reward flow: 100 GDx/day (1.1574 wei/second)
├─ User's share: 1000/1000 * 1.1574 = 1.1574 wei/second
├─ User earns: 100 GDx/day (since they're 100% of pool)
│
Second user stakes 1000 GDx
├─ Total staked now: 2000 GDx
├─ Each user gets: 50 GDx/day
├─ Rewards stream in real-time
│
User claims rewards
└─ Receives streamed rewards
```

## 🐛 Troubleshooting

### "distributeFlow failed"
- Ensure contract has sufficient Super Token balance
- Flow rate must be >= 0
- Pool must exist

### "Member update failed"
- Pool hasn't been created yet
- Call `createRewardPool()` first

### "Only reward admin"
- Check signer matches `rewardAdmin` address
- Or use owner address

### Scaling Factor Issues
- If units are 0, increase scaling factor
- If units are too large, decrease scaling factor
- See formula above

## 📚 Learn More

- [Superfluid Docs](https://docs.superfluid.org)
- [GoodDollar Protocol](https://docs.gooddollar.org)
- [Official SF Staking Example](https://github.com/superfluid-org/sf-example-staking)
- [Distribution Pools Guide](https://docs.superfluid.org/docs/protocol/distributions/guides/pools)

## ✅ Deployment Checklist

- [ ] Wrapped GoodDollar as Super Token
- [ ] Saved Super Token address
- [ ] Set SUPER_GOOD_DOLLAR env var
- [ ] Set REWARD_ADMIN_ADDRESS env var
- [ ] Deployed DripStaking contract
- [ ] Created reward pool
- [ ] Funded staking contract
- [ ] Set reward flow rate
- [ ] Tested staking and claiming
- [ ] Verified rewards streaming

---

**Questions?** Check the contract documentation in [DripStaking.sol](../apps/contracts/contracts/DripStaking.sol).
