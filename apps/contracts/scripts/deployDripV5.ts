/**
 * deployDripV5.ts
 *
 * Deploys StreamVault (implementation) and DripV5 to the target network.
 * DripV5 receives the StreamVault address at construction so it can clone it,
 * then the USDC→G$ swap route is configured so createStreamWithSwap works.
 *
 * Usage:
 *   npx hardhat run scripts/deployDripV5.ts --network celo
 *   npx hardhat run scripts/deployDripV5.ts --network alfajores
 */

import { ethers } from "hardhat";

// Celo mainnet swap route: fund G$ streams by paying USDC.
// exactOutput path is encoded output→input: G$ →(1%)→ cUSD →(0.01%)→ USDC.
const GOOD_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
const CUSD        = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const USDC        = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

function buildUsdcSwapPath(): string {
  const s = (a: string) => a.slice(2).toLowerCase();
  // fee 10000 = 0x002710 (1%), fee 100 = 0x000064 (0.01%)
  return `0x${s(GOOD_DOLLAR)}002710${s(CUSD)}000064${s(USDC)}`;
}

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
  // Reuse an already-deployed vault impl (set VAULT_IMPL_ADDR) to avoid paying
  // for a redeploy — handy when a previous run deployed the vault but the
  // DripV5 step failed (e.g. ran out of gas).
  let vaultImplAddr = process.env.VAULT_IMPL_ADDR ?? "";
  if (vaultImplAddr) {
    console.log("\n[1/3] Reusing existing StreamVault impl :", vaultImplAddr);
  } else {
    console.log("\n[1/3] Deploying StreamVault (implementation)…");
    const VaultFactory = await ethers.getContractFactory("StreamVault");
    const vaultImpl    = await VaultFactory.deploy();
    await vaultImpl.waitForDeployment();
    vaultImplAddr = await vaultImpl.getAddress();
    console.log("      StreamVault impl :", vaultImplAddr);
  }

  // ── Step 2: Deploy DripV5 ─────────────────────────────────────────────────
  // Second arg is platformFeeRecipient.  Defaults to deployer; pass address(0) to disable fees.
  console.log("\n[2/3] Deploying DripV5…");
  const DripV5Factory = await ethers.getContractFactory("DripV5");
  const dripV5        = await DripV5Factory.deploy(vaultImplAddr, deployer.address);
  await dripV5.waitForDeployment();
  const dripV5Addr = await dripV5.getAddress();
  console.log("      DripV5           :", dripV5Addr);
  console.log("      Fee recipient    :", deployer.address, "(0.5% default)");

  // ── Step 3: Configure USDC→G$ swap route ──────────────────────────────────
  console.log("\n[3/3] Setting USDC swap route…");
  const path = buildUsdcSwapPath();
  const tx   = await (dripV5 as any).setUsdcRoute(USDC, path);
  await tx.wait();
  console.log("      USDC token       :", USDC);
  console.log("      Swap path        :", path);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Deployment complete");
  console.log("═══════════════════════════════════════════════");
  console.log("  StreamVault impl :", vaultImplAddr);
  console.log("  DripV5           :", dripV5Addr);
  console.log("\n  Save these for the frontend config and keeper.");
  console.log("═══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
