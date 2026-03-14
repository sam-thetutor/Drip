import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * @title Upgrade to DripCoreV3 (Phone Mapping)
 * @notice Upgrades the existing DripCore proxy to a DripCoreV3 implementation
 *         that includes on-chain phone hash mapping.
 */
const UpgradeToDripCoreV3PhoneMappingModule = buildModule(
  "UpgradeToDripCoreV3PhoneMappingModule",
  (m) => {
    const deployer = m.getAccount(0);

    // Existing proxy + admin on Celo Mainnet
    const proxyAddress = m.getParameter(
      "proxyAddress",
      "0x5530975fDe062FE6706298fF3945E3d1a17A310a"
    );
    const proxyAdminAddress = m.getParameter(
      "proxyAdminAddress",
      "0x90FD81efC0bB74cca2997ebB6D77e5145788f481"
    );

    // Step 1: Deploy the new V3 implementation (with phone mapping)
    const newImplementation = m.contract("DripCoreV3", [], {
      id: "DripCoreV3PhoneMappingImplementation",
    });

    // Step 2: Upgrade existing proxy using existing ProxyAdmin
    const proxyAdmin = m.contractAt("ProxyAdmin", proxyAdminAddress, {
      id: "ExistingProxyAdmin",
    });

    // No reinitializer needed for phone mapping storage append.
    m.call(proxyAdmin, "upgradeAndCall", [proxyAddress, newImplementation, "0x"], {
      id: "UpgradeToV3PhoneMapping",
      from: deployer,
    });

    return {
      proxyAddress,
      newImplementation,
      proxyAdmin,
    };
  }
);

export default UpgradeToDripCoreV3PhoneMappingModule;
