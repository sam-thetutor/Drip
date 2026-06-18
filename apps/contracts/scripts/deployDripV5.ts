/**
 * deployDripV5.ts
 *
 * Deploys StreamVault (implementation) and DripV5, then configures the USDC→G$
 * swap route used by createStreamWithSwap.
 *
 * DripV5 = DripV4 + in-contract exactOutput swap funding (USDC → G$).
 *
 * Usage:
 *   npx hardhat run scripts/deployDripV5.ts --network celo
 *   npx hardhat run scripts/deployDripV5.ts --network alfajores
 */

import { ethers } from "hardhat";

// ── Celo mainnet token addresses ─────────────────────────────────────────────
const GOOD_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
const CUSD        = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const USDC        = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

// Uniswap V3 fee tiers (verified liquid pools on Celo):
//   G$ / cUSD  → 1%    (10000)
//   cUSD / USDC → 0.01% (100)
const FEE_GD_CUSD   = 10000;
const FEE_CUSD_USDC = 100;

/**
 * exactOutput path is reverse-encoded: tokenOut (G$) first → tokenIn (USDC) last.
 *   G$ ─10000─ cUSD ─100─ USDC
 */
function buildExactOutputPath(): string {
  return ethers.solidityPacked(
    ["address", "uint24", "address", "uint24", "address"],
    [GOOD_DOLLAR, FEE_GD_CUSD, CUSD, FEE_CUSD_USDC, USDC]
  );
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
  console.log("\n[1/3] Deploying StreamVault (implementation)…");
  const VaultFactory = await ethers.getContractFactory("StreamVault");
  const vaultImpl    = await VaultFactory.deploy();
  await vaultImpl.waitForDeployment();
  const vaultImplAddr = await vaultImpl.getAddress();
  console.log("      StreamVault impl :", vaultImplAddr);

  // ── Step 2: Deploy DripV5 ────────────────────────────────────────────────
  // Second arg is platformFeeRecipient. Defaults to deployer; pass address(0) to disable fees.
  console.log("\n[2/3] Deploying DripV5…");
  const DripV5Factory = await ethers.getContractFactory("DripV5");
  const dripV5        = await DripV5Factory.deploy(vaultImplAddr, deployer.address);
  await dripV5.waitForDeployment();
  const dripV5Addr = await dripV5.getAddress();
  console.log("      DripV5           :", dripV5Addr);
  console.log("      Fee recipient    :", deployer.address, "(0.5% default)");

  // ── Step 3: Configure USDC → G$ swap route ───────────────────────────────
  console.log("\n[3/3] Setting USDC swap route…");
  const path = buildExactOutputPath();
  const tx   = await dripV5.setUsdcRoute(USDC, path);
  await tx.wait();
  console.log("      USDC token       :", USDC);
  console.log("      Swap path        :", path);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════");
  console.log("  Deployment complete");
  console.log("═══════════════════════════════════════════════");
  console.log("  StreamVault impl :", vaultImplAddr);
  console.log("  DripV5           :", dripV5Addr);
  console.log("  USDC route       :", USDC, "(set)");
  console.log("\n  Update the frontend config with the DripV5 address above.");
  console.log("═══════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
