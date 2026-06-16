/**
 * deployDripV5.ts
 *
 * Deploys StreamVault (implementation) and DripV4 to the target network.
 * DripV4 receives the StreamVault address at construction so it can clone it.
 *
 * Usage:
 *   npx hardhat run scripts/deployDripV5.ts --network celo
 *   npx hardhat run scripts/deployDripV5.ts --network alfajores
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("═══════════════════════════════════════════════");
  console.log("  DripV5 Deployment");
  console.log("═══════════════════════════════════════════════");
  console.log("  Network   :", network.name, `(chainId ${network.chainId})`);
  console.log("  Deployer  :", deployer.address);
  console.log("  Balance   :", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "CELO");
  console.log("───────────────────────────────────────────────");

  // ── Step 1: Deploy StreamVault (implementation) ──────────────────────────
  console.log("\n[1/2] Deploying StreamVault (implementation)…");
  const VaultFactory = await ethers.getContractFactory("StreamVault");
  const vaultImpl    = await VaultFactory.deploy();
  await vaultImpl.waitForDeployment();
  const vaultImplAddr = await vaultImpl.getAddress();
  console.log("      StreamVault impl :", vaultImplAddr);

  // ── Step 2: Deploy DripV4 ─────────────────────────────────────────────────
  // Second arg is platformFeeRecipient.  Defaults to deployer; pass address(0) to disable fees.
  console.log("\n[2/2] Deploying DripV4…");
  const DripV4Factory = await ethers.getContractFactory("DripV4");
  const dripV4        = await DripV4Factory.deploy(vaultImplAddr, deployer.address);
  await dripV4.waitForDeployment();
  const dripV4Addr = await dripV4.getAddress();
  console.log("      DripV4           :", dripV4Addr);
  console.log("      Fee recipient    :", deployer.address, "(0.5% default)");

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Deployment complete");
  console.log("═══════════════════════════════════════════════");
  console.log("  StreamVault impl :", vaultImplAddr);
  console.log("  DripV4           :", dripV4Addr);
  console.log("\n  Save these for the test script and keeper config.");
  console.log("═══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
