import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DripStakingModule = buildModule("DripStakingModule", (m) => {
  // Celo Mainnet Configuration
  const CELO_MAINNET = {
    // GoodDollar token on Celo (already Superfluid compatible)
    superToken: process.env.SUPER_GOOD_DOLLAR || "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",

    // GDAv1Forwarder — same address on all Superfluid-supported chains
    gdaForwarder: "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08",

    // Reward admin wallet (receives ability to set reward flow rates)
    rewardAdmin: process.env.REWARD_ADMIN_ADDRESS || "0x0000000000000000000000000000000000000000",

    // Scaling factor for unit calculations
    // Prevents precision loss in unit-to-token conversions
    // Recommended: 1e15 for typical staking amounts
    scalingFactor: process.env.SCALING_FACTOR || "1000000000000000", // 1e15
  };

  // Validate required environment variables
  if (CELO_MAINNET.rewardAdmin === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "REWARD_ADMIN_ADDRESS environment variable not set. " +
      "This is the address that will manage reward distribution. " +
      "Set it with: export REWARD_ADMIN_ADDRESS=<address>"
    );
  }

  // Deploy DripStaking as UUPS proxy
  const dripStaking = m.contract("DripStaking");

  // Initialize proxy
  m.call(dripStaking, "initialize", [
    CELO_MAINNET.superToken,        // Super Token address (GoodDollar)
    CELO_MAINNET.gdaForwarder,      // GDAv1Forwarder address
    CELO_MAINNET.rewardAdmin,       // Reward Admin address
    CELO_MAINNET.scalingFactor,     // Scaling factor (BigInt)
  ]);

  return { dripStaking };
});

export default DripStakingModule;
