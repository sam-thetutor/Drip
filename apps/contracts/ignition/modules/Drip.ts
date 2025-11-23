import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * @title Drip Deployment Module
 * @notice Deployment configuration for Drip contracts
 * @dev This module handles deployment of all Drip-related contracts
 */
const DripModule = buildModule("DripModule", (m) => {
  // Deploy DripCore contract
  const dripCore = m.contract("DripCore", [], {
    id: "DripCore",
  });

  // Deploy SubscriptionManager contract
  // Note: SubscriptionManager will be deployed in a future milestone
  // const subscriptionManager = m.contract("SubscriptionManager", [dripCore], {
  //   id: "SubscriptionManager",
  // });

  return { dripCore };
});

export default DripModule;

