import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * @title Upgrade DripCoreV3 Implementation
 * @notice Redeploys the DripCoreV3 implementation to add getStreamPool() view function,
 *         then upgrades the existing proxy. No storage layout changes — plain upgrade only.
 *
 * Proxy:      0x5530975fDe062FE6706298fF3945E3d1a17A310a (Celo Mainnet)
 * ProxyAdmin: 0x90FD81efC0bB74cca2997ebB6D77e5145788f481 (Celo Mainnet)
 */
const UpgradeDripCoreV3Module = buildModule("UpgradeDripCoreV3Module", (m) => {
  const deployer = m.getAccount(0);

  const proxyAddress = m.getParameter(
    "proxyAddress",
    "0x5530975fDe062FE6706298fF3945E3d1a17A310a"
  );
  const proxyAdminAddress = m.getParameter(
    "proxyAdminAddress",
    "0x90FD81efC0bB74cca2997ebB6D77e5145788f481"
  );

  // Deploy the new V3 implementation (adds getStreamPool view function)
  const newImplementation = m.contract("DripCoreV3", [], {
    id: "DripCoreV3Implementation",
  });

  // Use the existing ProxyAdmin to upgrade (no reinitializer needed — view function only)
  const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress, {
    id: "ExistingProxyAdmin",
  });

  // upgradeAndCall with empty calldata — no reinitializer needed (view function only)
  m.call(proxyAdmin, "upgradeAndCall", [proxyAddress, newImplementation, "0x"], {
    id: "UpgradeDripCoreV3",
    from: deployer,
  });

  return {
    newImplementation,
  };
});

export default UpgradeDripCoreV3Module;
