import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DripCoreSuperfluidProxyModule = buildModule("DripCoreSuperfluidProxyModule", (m) => {
  const deployer = m.getAccount(0);

  const platformFeeRecipient = m.getParameter("platformFeeRecipient", deployer);
  const proxyOwner = m.getParameter("proxyOwner", deployer);

  const superToken = m.getParameter("superToken", "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A");
  const gdaForwarder = m.getParameter("gdaForwarder", "0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08");

  const implementation = m.contract("DripCoreSuperfluid", [], {
    id: "DripCoreSuperfluid",
  });

  m.call(implementation, "initialize", [
    platformFeeRecipient,
    proxyOwner,
    superToken,
    gdaForwarder,
  ]);

  return {
    implementation,
  };
});

export default DripCoreSuperfluidProxyModule;
