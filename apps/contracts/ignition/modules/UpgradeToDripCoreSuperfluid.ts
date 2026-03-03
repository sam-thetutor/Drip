import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * @title Upgrade to DripCoreSuperfluid Module
 * @notice Upgrades existing DripCore proxy (0x5530975fDe062FE6706298fF3945E3d1a17A310a) to DripCoreSuperfluid implementation
 * @dev Uses existing ProxyAdmin at 0x90FD81efC0bB74cca2997ebB6D77e5145788f481
 */
const UpgradeToDripCoreSuperfluidModule = buildModule("UpgradeToDripCoreSuperfluidModule", (m) => {
  const deployer = m.getAccount(0);

  // Existing contract addresses on Celo mainnet
  const EXISTING_PROXY = "0x5530975fDe062FE6706298fF3945E3d1a17A310a";
  const EXISTING_PROXY_ADMIN = "0x90FD81efC0bB74cca2997ebB6D77e5145788f481";

  // Superfluid parameters
  const superToken = m.getParameter("superToken", "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A"); // GoodDollar SuperToken
  const gdaForwarder = m.getParameter("gdaForwarder", "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08"); // GDAv1Forwarder

  // Step 1: Deploy new DripCoreSuperfluid implementation
  const newImplementation = m.contract("DripCoreSuperfluid", [], {
    id: "DripCoreSuperfluidImplementation",
  });

  // Step 2: Get reference to existing ProxyAdmin
  const proxyAdmin = m.contractAt("ProxyAdmin", EXISTING_PROXY_ADMIN, {
    id: "ExistingProxyAdmin",
  });

  // Step 3: Prepare configuration call
  const configData = m.encodeFunctionCall(
    newImplementation,
    "setSuperfluidConfig",
    [superToken, gdaForwarder]
  );

  // Step 4: Upgrade the proxy to new implementation with config call
  m.call(
    proxyAdmin,
    "upgradeAndCall",
    [
      EXISTING_PROXY,
      newImplementation,
      configData,
    ],
    {
      id: "UpgradeToSuperfluid",
      from: deployer,
    }
  );

  return {
    newImplementation,
    proxyAdmin,
    proxyAddress: EXISTING_PROXY,
  };
});

export default UpgradeToDripCoreSuperfluidModule;
