/**
 * testSwapStream.ts
 *
 * End-to-end test of DripV5.createStreamWithSwap (USDC → G$ funding).
 *
 * Because the test wallet holds G$ but no USDC, this script:
 *   1. Bootstraps USDC by swapping a little G$ → USDC on Uniswap V3 (exactInput).
 *   2. Approves USDC to DripV5.
 *   3. Quotes the USDC needed (exactOutput) and calls createStreamWithSwap.
 *   4. Reads back the stream + vault balance to confirm the vault now holds G$.
 *
 * Usage:
 *   npx hardhat run scripts/testSwapStream.ts --network celo
 */

import { ethers } from "hardhat";

// ── Addresses (Celo mainnet) ──────────────────────────────────────────────────
const DRIP_V5     = "0x75d5e1bDb93dB238DFD56e183784a6F7386c05E8";
const SWAP_ROUTER = "0x5615CDAb10dc425a742d643d949a7F474C01abc4";
const QUOTER      = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8";
const GOOD_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
const CUSD        = "0x765DE816845861e75A25fCA122bb6898B8B1282a";
const USDC        = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

const RECIPIENT   = "0x000000000000000000000000000000000000dEaD"; // burn addr — fine as a CFA receiver for the test

// Reverse-encoded exactOutput path: G$ →(1%)→ cUSD →(0.01%)→ USDC
const PATH = ethers.solidityPacked(
  ["address", "uint24", "address", "uint24", "address"],
  [GOOD_DOLLAR, 10000, CUSD, 100, USDC]
);
// exactInput path (same encoding, direction G$ → USDC) for the bootstrap swap
const IN_PATH = PATH;

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
];
const QUOTER_ABI = [
  "function quoteExactOutput(bytes path, uint256 amountOut) returns (uint256 amountIn)",
];
// SwapRouter02 — no per-call deadline field
const ROUTER_ABI = [
  "function exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum)) payable returns (uint256 amountOut)",
];
const DRIP_ABI = [
  "function createStreamWithSwap(uint256 maxAmountIn, address[] recipients, int96[] flowRates, uint256 totalAmount, string title, string description) returns (uint256 streamId, address vault)",
  "function streamCount() view returns (uint256)",
  "function getVaultBalance(uint256) view returns (uint256)",
  "function getStream(uint256) view returns (tuple(uint256 streamId, address sender, address[] recipients, address token, int96[] flowRates, int96 totalFlowRate, uint256 totalAmount, uint256 depositAmount, address vault, uint256 startTime, uint256 endTime, uint256 finishTime, uint256 pausedAt, uint256 rateLockUntil, uint8 status, string title, string description))",
];

const fmt = (v: bigint, d = 18, p = 4) => Number(ethers.formatUnits(v, d)).toFixed(p);

async function main() {
  const [signer] = await ethers.getSigners();
  const me = signer.address;
  const provider = signer.provider!;

  const usdc   = new ethers.Contract(USDC, ERC20_ABI, signer);
  const gd     = new ethers.Contract(GOOD_DOLLAR, ERC20_ABI, signer);
  const quoter = new ethers.Contract(QUOTER, QUOTER_ABI, signer);
  const router = new ethers.Contract(SWAP_ROUTER, ROUTER_ABI, signer);
  const drip   = new ethers.Contract(DRIP_V5, DRIP_ABI, signer);

  console.log("═══════════════════════════════════════════════");
  console.log("  DripV5 createStreamWithSwap — E2E test");
  console.log("═══════════════════════════════════════════════");
  console.log("  Wallet :", me);
  console.log("  CELO   :", fmt(await provider.getBalance(me)));
  console.log("  G$     :", fmt(await gd.balanceOf(me)));
  console.log("  USDC   :", fmt(await usdc.balanceOf(me), 6, 6));

  // ── Define the test stream (kept tiny to minimise cost) ─────────────────────
  // totalAmount gross G$, with a low flow rate so the 4h buffer stays small.
  const totalAmount = ethers.parseUnits("500", 18);          // 500 G$ gross payout
  // flowRate chosen so buffer (flowRate * 14400s) ≈ 200 G$  →  ~0.0139 G$/s
  const flowRate    = ethers.parseUnits("200", 18) / 14400n; // int96 wei/s
  const recipients  = [RECIPIENT];
  const flowRates   = [flowRate];

  const BUFFER = 14400n;
  const neededGd = totalAmount + flowRate * BUFFER;
  console.log("\n  Test stream:");
  console.log("    recipient   :", RECIPIENT);
  console.log("    totalAmount :", fmt(totalAmount), "G$");
  console.log("    flowRate    :", flowRate.toString(), "wei/s  (≈", fmt(flowRate * 86400n), "G$/day)");
  console.log("    neededGd    :", fmt(neededGd), "G$  (payout + 4h buffer)");

  // ── Quote USDC needed (exactOutput) ─────────────────────────────────────────
  const usdcQuote = await quoter.quoteExactOutput.staticCall(PATH, neededGd);
  const maxAmountIn = (usdcQuote * 102n) / 100n; // 2% slippage headroom for the test
  console.log("\n  Quote: need ≈", fmt(usdcQuote, 6, 6), "USDC  (maxAmountIn", fmt(maxAmountIn, 6, 6), "USDC)");

  // ── Step 1: bootstrap USDC if we don't have enough ──────────────────────────
  let usdcBal: bigint = await usdc.balanceOf(me);
  if (usdcBal < maxAmountIn) {
    // Swap enough G$ → USDC. Aim for ~3x the needed amount to be safe.
    const targetUsdc = maxAmountIn * 3n;
    // Estimate G$ in: invert the rate from the neededGd quote
    const gdIn = (neededGd * targetUsdc) / usdcQuote; // proportional estimate
    const gdBal: bigint = await gd.balanceOf(me);
    const swapGd = gdIn > gdBal ? gdBal : gdIn;
    console.log("\n[1] Bootstrapping USDC — swapping", fmt(swapGd), "G$ → USDC…");

    const gdAllowance: bigint = await gd.allowance(me, SWAP_ROUTER);
    if (gdAllowance < swapGd) {
      const a = await gd.approve(SWAP_ROUTER, ethers.MaxUint256);
      await a.wait();
      console.log("    G$ approved to router");
    }
    const sw = await router.exactInput({
      path: IN_PATH, recipient: me, amountIn: swapGd, amountOutMinimum: 0n,
    });
    await sw.wait();
    usdcBal = await usdc.balanceOf(me);
    console.log("    ✓ USDC now:", fmt(usdcBal, 6, 6));
  }

  if (usdcBal < maxAmountIn) {
    throw new Error(`Not enough USDC after bootstrap: have ${fmt(usdcBal,6,6)}, need ${fmt(maxAmountIn,6,6)}`);
  }

  // ── Step 2: approve USDC to DripV5 ──────────────────────────────────────────
  const allowance: bigint = await usdc.allowance(me, DRIP_V5);
  if (allowance < maxAmountIn) {
    console.log("\n[2] Approving USDC to DripV5…");
    const a = await usdc.approve(DRIP_V5, maxAmountIn);
    await a.wait();
    console.log("    ✓ approved", fmt(maxAmountIn, 6, 6), "USDC");
  } else {
    console.log("\n[2] USDC allowance already sufficient");
  }

  // ── Step 3: createStreamWithSwap ────────────────────────────────────────────
  const usdcBefore: bigint = await usdc.balanceOf(me);
  console.log("\n[3] Calling createStreamWithSwap…");
  const tx = await drip.createStreamWithSwap(
    maxAmountIn, recipients, flowRates, totalAmount,
    "USDC swap test", "funded with USDC, streamed as G$"
  );
  console.log("    tx:", tx.hash);
  const rcpt = await tx.wait();
  console.log("    ✓ mined in block", rcpt!.blockNumber, "· gas", rcpt!.gasUsed.toString());

  // ── Step 4: verify (small delay — forno nodes lag on read-after-write) ──────
  await new Promise((r) => setTimeout(r, 4000));
  const streamId: bigint = await drip.streamCount();
  const s = await drip.getStream(streamId);
  const vaultBal: bigint = await drip.getVaultBalance(streamId);
  const usdcAfter: bigint = await usdc.balanceOf(me);
  const usdcSpent = usdcBefore - usdcAfter;

  console.log("\n═══════════════════════════════════════════════");
  console.log("  Result");
  console.log("═══════════════════════════════════════════════");
  console.log("  Stream ID      :", streamId.toString());
  console.log("  Sender         :", s.sender);
  console.log("  Stream token   :", s.token, s.token.toLowerCase() === GOOD_DOLLAR.toLowerCase() ? "(G$ ✓)" : "(NOT G$ ✗)");
  console.log("  Vault          :", s.vault);
  console.log("  Vault G$ bal   :", fmt(vaultBal), "G$");
  console.log("  depositAmount  :", fmt(s.depositAmount), "G$ (expected vault balance)");
  console.log("  USDC spent     :", fmt(usdcSpent, 6, 6), "USDC");
  console.log("  USDC refunded  :", fmt(maxAmountIn - usdcSpent, 6, 6), "USDC (unused, returned)");
  console.log("  Stream status  :", ["Active","Paused","Completed","Cancelled"][Number(s.status)]);
  console.log("  Ends           :", new Date(Number(s.endTime) * 1000).toISOString());

  const ok = s.token.toLowerCase() === GOOD_DOLLAR.toLowerCase() && vaultBal > 0n;
  console.log("\n  " + (ok
    ? "✅ SUCCESS — USDC was swapped to G$ and the vault is funded in G$."
    : "❌ FAILED — vault not funded in G$."));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
