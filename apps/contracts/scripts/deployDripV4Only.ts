/**
 * deployDripV4Only.ts
 *
 * Deploys just DripV4 using an already-deployed StreamVault implementation.
 *
 * Usage:
 *   VAULT_IMPL=0x... npx hardhat run scripts/deployDripV4Only.ts --network celo
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  const vaultImpl = process.env.VAULT_IMPL;
  if (!vaultImpl) throw new Error("Set VAULT_IMPL env var to the StreamVault implementation address");

  console.log("  Network   :", network.name, `(chainId ${network.chainId})`);
  console.log("  Deployer  :", deployer.address);
  console.log("  Balance   :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "CELO");
  console.log("  Vault impl:", vaultImpl);

  const F      = await ethers.getContractFactory("DripV4");
  const dripV4 = await F.deploy(vaultImpl, deployer.address);
  await dripV4.waitForDeployment();
  const addr   = await dripV4.getAddress();

  console.log("\n  ✓ DripV4 deployed:", addr);
  console.log("  Fee recipient   :", deployer.address, "(0.5% default)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
