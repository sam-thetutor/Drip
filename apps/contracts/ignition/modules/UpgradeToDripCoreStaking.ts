import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * @title Upgrade to DripCore Staking Module
 * @notice Upgrades an existing DripCore proxy to a staking-enabled DripCore implementation
 * @dev After upgrade, it optionally configures staking token and GDA forwarder.
 */
const UpgradeToDripCoreStakingModule = buildModule("UpgradeToDripCoreStakingModule", (m) => {
  const deployer = m.getAccount(0);

  const proxyAddress = m.getParameter("proxyAddress", "0x19a05b5bCD18A2A14c620F86356C44ecD5946203");
  const proxyAdminAddress = m.getParameter("proxyAdminAddress", "0x97b3cCcFe554F0422a127Ab392cF98Ea0d44AffB");

  // GoodDollar SuperToken on Celo mainnet by default.
  const stakingToken = m.getParameter("stakingToken", "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A");
  const gdaForwarder = m.getParameter("gdaForwarder", "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08");
  const enableStaking = m.getParameter("enableStaking", true);

  // Deploy the new implementation.
  const newImplementation = m.contract("DripCore", [], {
    id: "DripCoreStakingImplementation",
  });

  // Use existing ProxyAdmin to perform upgrade.
  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress, {
    id: "ExistingProxyAdmin",
  });

  m.call(
    proxyAdmin,
    "upgrade",
    [proxyAddress, newImplementation],
    {
      id: "UpgradeToDripCoreStaking",
      from: deployer,
    }
  );

  // Configure staking after upgrade.
  const proxyAsDripCore = m.contractAt("DripCore", proxyAddress, {
    id: "DripCoreProxyAfterUpgrade",
  });

  m.call(
    proxyAsDripCore,
    "setStakingConfig",
    [stakingToken, gdaForwarder],
    {
      id: "SetStakingConfig",
      from: deployer,
      after: ["UpgradeToDripCoreStaking"],
    }
  );

  m.call(
    proxyAsDripCore,
    "setStakingEnabled",
    [enableStaking],
    {
      id: "SetStakingEnabled",
      from: deployer,
      after: ["SetStakingConfig"],
    }
  );

  return {
    proxyAddress,
    newImplementation,
    proxyAdmin,
  };
});

export default UpgradeToDripCoreStakingModule;
