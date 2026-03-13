# DripStakingV2 — Implementation Plan

## Overview

Users stake G$ tokens and earn **points** proportional to their stake × time held.
Points are on-chain, readable by the frontend, and will power the leaderboard,
tier unlocks, and future token reward layers (V3).

No Superfluid pool is required at this stage — keeping the contract lean and auditable.

---

## Points Formula

```
pointsPerSecond = stakedAmount / POINTS_DENOMINATOR
accruedPoints   = pointsPerSecond × (block.timestamp - lastUpdateTime)
totalPoints     = snapshotPoints + accruedPoints
```

- `POINTS_DENOMINATOR = 1e18`
- 1 token staked for 1 day = 86 400 points
- Points never decrease — unstaking stops accrual but keeps past points

---

## Data Model

```solidity
struct StakerInfo {
    uint256 stakedAmount;      // current stake
    uint256 snapshotPoints;    // points banked up to last action
    uint256 lastUpdateTime;    // timestamp of last stake / unstake
}

mapping(address => StakerInfo) public stakers;
uint256 public totalStaked;
uint256 public totalPointsIssued;   // global counter (leaderboard)
```

---

## Contract: `DripStakingV2.sol`

### Imports
- `OwnableUpgradeable`
- `Initializable`
- `UUPSUpgradeable`
- `ReentrancyGuardUpgradeable`

No Superfluid imports needed.

### Constants
| Name | Value | Purpose |
|---|---|---|
| `POINTS_DENOMINATOR` | `1e18` | Scale points to human-readable numbers |

### State Variables
| Variable | Type | Notes |
|---|---|---|
| `token` | `IERC20` | G$ token address |
| `stakers` | `mapping(address => StakerInfo)` | Per-user stake + points |
| `totalStaked` | `uint256` | Sum of all active stakes |
| `totalPointsIssued` | `uint256` | Monotonically increasing global counter |
| `__gap` | `uint256[50]` | UUPS upgrade safety |

---

## Functions

### User-Facing

| Function | Access | Description |
|---|---|---|
| `stake(uint256 amount)` | external | Checkpoints points → transfers tokens in → updates stake + timer |
| `unstake(uint256 amount)` | external | Checkpoints points → transfers tokens out → updates stake |
| `checkpointPoints()` | external | Force-syncs `snapshotPoints` without moving tokens |
| `emergencyUnstake()` | external | Checkpoints points, then returns full stake in one call |

### View

| Function | Returns | Description |
|---|---|---|
| `getPoints(address)` | `uint256` | Live total points (snapshot + accrued since last action) |
| `getStakerInfo(address)` | `(staked, totalPoints, pointsPerSecond, lastUpdate)` | Full staker state in one call |

### Owner / Admin

| Function | Access | Description |
|---|---|---|
| `initialize(address token)` | initializer | Sets token + owner |
| `recoverExcess(address to)` | owner | Recover tokens above `totalStaked` (admin dust recovery) |

---

## CEI Order (all write functions)

```
1. _checkpointPoints(msg.sender)   ← Effects first
2. Update stakes / totalStaked     ← Effects
3. token.transfer / transferFrom   ← Interaction last
```

---

## Bug fixes vs old DripStaking.sol

| Old bug | Fix |
|---|---|
| CEI violation (transfer before state) | State updated before any transfer |
| Post-unstake rewards locked | Points survive unstake, readable forever |
| `setScalingFactor` corrupts stakers | No scaling factor — formula is constant |
| Missing `__gap` | `uint256[50] private __gap` included |
| `connectPool` return ignored | No pool — N/A |
| Full unstake no disconnect | No pool — N/A |
| `receive()` trap | No `receive()` function |
| Negative claimable | No claimable, only uint256 points |
| `int96` cast bug | No int96 — all uint256 math |

---

## Integration Path

### Frontend (immediate)
- Call `getPoints(address)` per staker for the leaderboard
- Call `getStakerInfo(address)` to display stake + points in the staking UI

### V3 Upgrade (future)
- Add Superfluid GDA pool on top of points
- Points → stream weight: stakers with more points get higher pool units → token rewards
- Or: points → tier unlocks (Bronze / Silver / Gold) that gate features

---

## Files to Create / Modify

| File | Action |
|---|---|
| `apps/contracts/contracts/DripStakingV2.sol` | Create — new contract |
| `apps/contracts/deploy/DripStakingV2.ts` | Create — deploy script |
| `apps/web/src/lib/contracts/drip-staking-v2.abi.ts` | Create — ABI for frontend |
| `apps/web/src/lib/contracts/config.ts` | Update — add `DripStakingV2` address entry |
| `apps/web/src/hooks/useDripStaking.ts` | Create — wagmi hooks (stake, unstake, getPoints) |
| `apps/web/src/app/staking/page.tsx` | Create — staking UI page |

---

## Deployment Parameters

```ts
initialize(
  token: "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A"  // G$ on Celo
)
```
