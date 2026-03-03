import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const DripCoreSuperfluidCFAProxyModule = buildModule("DripCoreSuperfluidCFAProxyModule", (m) => {
  const deployer = m.getAccount(0);

  const platformFeeRecipient = m.getParameter("platformFeeRecipient", deployer);
  const proxyOwner = m.getParameter("proxyOwner", deployer);

  // GoodDollar SuperToken on Celo Mainnet
  const superToken = m.getParameter("superToken", "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A");
  
  // CFAv1Forwarder on Celo Mainnet
  const cfaForwarder = m.getParameter("cfaForwarder", "0xcfA132E353cB4E398080B9700609bb008eceB125");

  const implementation = m.contract("DripCoreSuperfluidCFA", [], {
    id: "DripCoreSuperfluidCFA",
  });

  m.call(implementation, "initialize", [
    platformFeeRecipient,
    proxyOwner,
    superToken,
    cfaForwarder,
  ]);

  return {
    implementation,
  };
});

export default DripCoreSuperfluidCFAProxyModule;
