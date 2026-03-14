import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * @title Upgrade to DripCoreV4
 * @notice Upgrades the existing DripCore proxy from V3 (GDA) to V4 (CFA).
 *         Uses reinitializer(3) to set the CFA forwarder address once.
 */
const UpgradeToDripCoreV4Module = buildModule("UpgradeToDripCoreV4Module", (m) => {
  const deployer = m.getAccount(0);

  // Existing proxy + admin on Celo Mainnet
  const proxyAddress = m.getParameter("proxyAddress", "0x5530975fDe062FE6706298fF3945E3d1a17A310a");
  const proxyAdminAddress = m.getParameter("proxyAdminAddress", "0x90FD81efC0bB74cca2997ebB6D77e5145788f481");

  // CFAv1Forwarder on Celo Mainnet
  const cfaForwarder = m.getParameter("cfaForwarder", "0xcfA132E353cB4E398080B9700609bb008eceB125");

  // Step 1: Deploy the new V4 implementation
  const newImplementation = m.contract("DripCoreV4", [], {
    id: "DripCoreV4Implementation",
  });

  // Step 2: Upgrade the proxy to V4
  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress, {
    id: "ExistingProxyAdmin",
  });

  m.call(proxyAdmin, "upgrade", [proxyAddress, newImplementation], {
    id: "UpgradeToV4",
    from: deployer,
  });

  // Step 3: Initialize CFA forwarder (reinitializer(3))
  const proxyAsV4 = m.contractAt("DripCoreV4", proxyAddress, {
    id: "DripCoreV4ProxyAfterUpgrade",
  });

  m.call(proxyAsV4, "initializeCFA", [cfaForwarder], {
    id: "InitializeCFA",
    from: deployer,
    after: ["UpgradeToV4"],
  });

  return {
    proxyAddress,
    newImplementation,
    proxyAdmin,
  };
});

export default UpgradeToDripCoreV4Module;
