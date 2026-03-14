import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * @title Deploy DripCoreV4 Standalone
 * @notice Deploys DripCoreV4 as a standalone contract (no proxy) for testing.
 *         Once verified, use UpgradeToDripCoreV4 to upgrade the existing proxy.
 */
const DeployDripCoreV4Module = buildModule("DeployDripCoreV4Module", (m) => {
  const deployer = m.getAccount(0);

  const platformFeeRecipient = m.getParameter("platformFeeRecipient", deployer);
  const owner = m.getParameter("owner", deployer);

  // GoodDollar SuperToken on Celo Mainnet
  const superToken = m.getParameter("superToken", "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A");

  // CFAv1Forwarder on Celo Mainnet
  const cfaForwarder = m.getParameter("cfaForwarder", "0xcfA132E353cB4E398080B9700609bb008eceB125");

  // GoodDollar token for staking (same as SuperToken on Celo)
  const stakingToken = m.getParameter("stakingToken", "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A");

  // Step 1: Deploy DripCoreV4
  const dripCoreV4 = m.contract("DripCoreV4", [], {
    id: "DripCoreV4Implementation",
  });

  // Step 2: Initialize streaming + CFA
  m.call(dripCoreV4, "initialize", [platformFeeRecipient, owner, superToken, cfaForwarder], {
    id: "InitializeStreaming",
    from: deployer,
  });

  // Step 3: Initialize staking
  m.call(dripCoreV4, "initializeStaking", [stakingToken], {
    id: "InitializeStaking",
    from: deployer,
    after: ["InitializeStreaming"],
  });

  return {
    dripCoreV4,
  };
});

export default DeployDripCoreV4Module;
