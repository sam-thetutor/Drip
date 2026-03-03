import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment module for testing with Mock Super Token
 * After testing, replace MockSuperToken with actual wrapped GoodDollar
 */
const DripStakingTestModule = buildModule("DripStakingTestModule", (m) => {
  // Deploy mock token first
  const mockToken = m.contract("MockSuperToken");

  // Deploy DripStaking with mock token
  const dripStaking = m.contract("DripStaking");

  // Initialize proxy with mock token
  m.call(dripStaking, "initialize", [
    mockToken,  // Mock token address
    "0x7818CEd1298849B47a9B56066b5adc72CDDAf733", // Reward admin (deployer)
    "1000000000000000", // Scaling factor (1e15)
  ]);

  return { dripStaking, mockToken };
});

export default DripStakingTestModule;
