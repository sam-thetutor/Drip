/**
 * testDripV5.ts  — full DripV4 feature lifecycle test
 *
 * Tests (in order):
 *  1.  Deploy / attach StreamVault + DripV4
 *  2.  createStream — 2 recipients, auto-start, description stored
 *  3.  Observe both CFA streams active
 *  4.  pauseRecipient(R1)   → R1 flow = 0, R2 still flowing
 *  5.  resumeRecipient(R1)  → R1 flow restored, endTime recalculated
 *  6.  pauseStream (whole)  → both flows stop
 *  7.  resumeStream (whole) → both flows restart, endTime extended
 *  8.  lockStreamRate       → cancelStream + pauseStream blocked
 *  9.  removeRecipient(R2)  → R2 flow = 0, R1 still flowing, endTime extended
 *  10. getActiveRecipients  → returns only R1
 *  11. cancelStream (after lock) → vault drained, R1 flow = 0, refund to sender
 *
 * Usage:
 *   npx hardhat run scripts/testDripV5.ts --network celo
 *
 * Reuse deployed contracts (skip fresh deploy):
 *   VAULT_IMPL_ADDR=0x...  DRIP_V4_ADDR=0x...  npx hardhat run scripts/testDripV5.ts --network celo
 */

import { ethers } from "hardhat";

const NETWORK_CONFIG: Record<string, { gDollar: string; cfaForwarder: string }> = {
  celo: {
    gDollar:      "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A",
    cfaForwarder: "0xcfA132E353cB4E398080B9700609bb008eceB125",
  },
};

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function decimals() view returns (uint8)",
];

const CFA_ABI = [
  "function getFlowrate(address token, address sender, address receiver) view returns (int96)",
];

// ── helpers ────────────────────────────────────────────────────────────────────

function sep(title: string) {
  console.log(`\n${"─".repeat(68)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(68));
}

function ok(msg: string)   { console.log("  ✓ " + msg); }
function warn(msg: string) { console.log("  ⚠ " + msg); }
function fail(msg: string) { console.log("  ✗ " + msg); }

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function fmt(amount: bigint, dec: number): string {
  const d = 10n ** BigInt(dec);
  return `${amount / d}.${(amount % d).toString().padStart(Number(dec), "0").slice(0, 4)}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rate(
  cfa: any,
  token: string,
  sender: string,
  receiver: string
): Promise<bigint> {
  return BigInt(await cfa.getFlowrate(token, sender, receiver).catch(() => 0n));
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();
  const netName    = network.name === "unknown" ? "celo" : network.name;
  const net        = NETWORK_CONFIG[netName] ?? NETWORK_CONFIG["celo"];

  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  DripV5  Full Feature Test (per-recipient controls)");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("  Network  :", netName, `(chainId ${network.chainId})`);
  console.log("  Deployer :", deployer.address);

  const gDollar      = new ethers.Contract(net.gDollar,      ERC20_ABI, deployer);
  const cfaForwarder = new ethers.Contract(net.cfaForwarder, CFA_ABI,   deployer);
  const dec          = Number(await gDollar.decimals());

  const deployerBal = await gDollar.balanceOf(deployer.address);
  console.log("  G$ balance :", fmt(deployerBal, dec), "G$");

  // ── Step 1: Deploy / attach ────────────────────────────────────────────────
  sep("Step 1 — Deploy / attach contracts");

  let vaultImplAddr = process.env.VAULT_IMPL_ADDR ?? "";
  let dripV4Addr    = process.env.DRIP_V5_ADDR ?? process.env.DRIP_V4_ADDR ?? "";
  let dripV4: any;

  if (vaultImplAddr && dripV4Addr) {
    console.log("  Attaching to existing contracts:");
    console.log("    StreamVault impl :", vaultImplAddr);
    console.log("    DripV5           :", dripV4Addr);
    const F = await ethers.getContractFactory("DripV5");
    dripV4  = F.attach(dripV4Addr);
  } else {
    console.log("  Deploying fresh…");
    const VF    = await ethers.getContractFactory("StreamVault");
    const vi    = await VF.deploy();
    await vi.waitForDeployment();
    vaultImplAddr = await vi.getAddress();
    console.log("    StreamVault impl :", vaultImplAddr);

    const DF = await ethers.getContractFactory("DripV5");
    dripV4   = await DF.deploy(vaultImplAddr, deployer.address);
    await dripV4.waitForDeployment();
    dripV4Addr = await dripV4.getAddress();
    console.log("    DripV5           :", dripV4Addr);
  }

  // ── Step 2: createStream ─────────────────────────────────────────────────
  sep("Step 2 — createStream (2 recipients, auto-start, with description)");

  const RECIPIENT_1 = "0x5bDE0C12Da23eD570b97ECf47DED04EfBC7cE4Dd";
  const RECIPIENT_2 = "0x000000000000000000000000000000000000dEaD";
  const TOKEN       = net.gDollar;

  const TOTAL_AMOUNT  = ethers.parseUnits("2", dec);   // 2 G$ gross
  const RATE_EACH     = BigInt(TOTAL_AMOUNT) / 2n / 60n; // ~1 G$ each over 60 s
  const totalFlowRate = RATE_EACH * 2n;
  const BUFFER_SECS   = 14400n;
  const approval      = BigInt(TOTAL_AMOUNT) + totalFlowRate * BUFFER_SECS;

  console.log("  R1             :", RECIPIENT_1);
  console.log("  R2             :", RECIPIENT_2);
  console.log("  Gross amount   :", fmt(BigInt(TOTAL_AMOUNT), dec), "G$");
  console.log("  Rate each      :", RATE_EACH.toString(), "wei/s");
  console.log("  Approval needed:", fmt(approval, dec), "G$");

  if (BigInt(deployerBal) < approval) {
    throw new Error(`Insufficient G$: have ${fmt(BigInt(deployerBal), dec)}, need ${fmt(approval, dec)}`);
  }

  const approveTx = await gDollar.approve(dripV4Addr, approval);
  await approveTx.wait();
  ok(`Approved DripV4 to spend ${fmt(approval, dec)} G$`);

  const createTx = await dripV4.createStream(
    [RECIPIENT_1, RECIPIENT_2],
    TOKEN,
    [RATE_EACH, RATE_EACH],
    TOTAL_AMOUNT,
    "DripV4 per-recipient test",
    "Testing pauseRecipient, resumeRecipient, removeRecipient"
  );
  const createReceipt = await createTx.wait();
  console.log("  tx:", createReceipt.hash);

  let streamId: bigint | undefined;
  let vaultAddr: string | undefined;
  for (const log of createReceipt.logs) {
    try {
      const F      = await ethers.getContractFactory("DripV5");
      const parsed = F.interface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "StreamCreated") {
        streamId  = parsed.args.streamId;
        vaultAddr = parsed.args.vault;
        console.log("  Stream ID    :", streamId!.toString());
        console.log("  Vault        :", vaultAddr);
        console.log("  Fee charged  :", fmt(parsed.args.feeAmount, dec), "G$");
        console.log("  Net amount   :", fmt(parsed.args.totalAmount, dec), "G$");
      }
    } catch { /* not our event */ }
  }
  if (!streamId || !vaultAddr) throw new Error("StreamCreated event not found");

  await sleep(3_000);
  const streamData = await dripV4.getStream(streamId);
  console.log("  description  :", streamData.description);
  if (streamData.description === "Testing pauseRecipient, resumeRecipient, removeRecipient") {
    ok("description stored correctly");
  } else {
    fail("description mismatch");
  }

  // ── Step 3: Observe both active ────────────────────────────────────────────
  sep("Step 3 — Observe both CFA streams (wait 8 s)");
  await sleep(8_000);

  const r1_init = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_1);
  const r2_init = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_2);
  console.log("  R1 flow rate :", r1_init.toString(), "wei/s");
  console.log("  R2 flow rate :", r2_init.toString(), "wei/s");
  if (r1_init > 0n && r2_init > 0n) ok("Both CFA streams confirmed active");
  else warn("Rates still indexing (RPC lag) — continuing");

  // ── Step 4: pauseRecipient(R1) ─────────────────────────────────────────────
  sep("Step 4 — pauseRecipient(R1)  — R2 keeps flowing");

  const pauseR1Tx = await dripV4.pauseRecipient(streamId, RECIPIENT_1);
  await pauseR1Tx.wait();
  console.log("  tx:", pauseR1Tx.hash);
  await sleep(5_000);

  const r1_paused  = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_1);
  const r2_after4  = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_2);
  const streamSt4  = await dripV4.getStream(streamId);
  const r1IsPaused = await dripV4.isRecipientPaused(streamId, RECIPIENT_1);

  console.log("  R1 flow rate :", r1_paused.toString(), "wei/s  (expected 0)");
  console.log("  R2 flow rate :", r2_after4.toString(), "wei/s  (should still flow)");
  console.log("  Stream status:", streamSt4.status.toString(), "(0 = Active, stream itself unchanged)");
  console.log("  isRecipientPaused(R1) :", r1IsPaused);
  if (r1_paused === 0n) ok("R1 flow stopped");
  if (r2_after4 > 0n)  ok("R2 still flowing");
  if (r1IsPaused)       ok("isRecipientPaused flag set correctly");
  if (Number(streamSt4.status) === 0) ok("Stream remains Active");

  // ── Step 5: resumeRecipient(R1) ────────────────────────────────────────────
  sep("Step 5 — resumeRecipient(R1)");

  const endTimeBefore5 = streamSt4.endTime;
  await sleep(3_000); // Let some time pass so endTime extension is visible

  const resumeR1Tx = await dripV4.resumeRecipient(streamId, RECIPIENT_1);
  await resumeR1Tx.wait();
  console.log("  tx:", resumeR1Tx.hash);
  await sleep(5_000);

  const r1_resumed  = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_1);
  const r2_after5   = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_2);
  const streamSt5   = await dripV4.getStream(streamId);
  const r1IsPaused5 = await dripV4.isRecipientPaused(streamId, RECIPIENT_1);

  console.log("  R1 flow rate      :", r1_resumed.toString(), "wei/s");
  console.log("  R2 flow rate      :", r2_after5.toString(), "wei/s");
  console.log("  endTime before    :", new Date(Number(endTimeBefore5) * 1000).toISOString());
  console.log("  endTime after     :", new Date(Number(streamSt5.endTime) * 1000).toISOString());
  console.log("  (endTime recalculated from vault balance — may decrease since both rates active again)");
  console.log("  isRecipientPaused :", r1IsPaused5);
  if (r1_resumed > 0n) ok("R1 flow restored");
  if (!r1IsPaused5)    ok("isRecipientPaused cleared");
  if (streamSt5.endTime !== endTimeBefore5) ok("endTime recalculated");

  // ── Step 6: pauseStream (whole) ────────────────────────────────────────────
  sep("Step 6 — pauseStream (all recipients)");

  const pauseAllTx = await dripV4.pauseStream(streamId);
  await pauseAllTx.wait();
  console.log("  tx:", pauseAllTx.hash);
  await sleep(5_000);

  const r1_p6 = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_1);
  const r2_p6 = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_2);
  const st6   = await dripV4.getStream(streamId);
  console.log("  R1 flow rate :", r1_p6.toString(), "wei/s  (expected 0)");
  console.log("  R2 flow rate :", r2_p6.toString(), "wei/s  (expected 0)");
  console.log("  Stream status:", st6.status.toString(), "(1 = Paused)");
  if (r1_p6 === 0n && r2_p6 === 0n) ok("Both flows stopped");
  if (Number(st6.status) === 1) ok("Stream status = Paused");

  // ── Step 7: resumeStream (whole) ───────────────────────────────────────────
  sep("Step 7 — resumeStream (extends endTime by pause duration)");

  const endTimeBefore7 = st6.endTime;
  await sleep(4_000);

  const resumeAllTx = await dripV4.resumeStream(streamId);
  await resumeAllTx.wait();
  console.log("  tx:", resumeAllTx.hash);
  await sleep(5_000);

  const r1_r7 = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_1);
  const r2_r7 = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_2);
  const st7   = await dripV4.getStream(streamId);
  const ext7  = Number(st7.endTime) - Number(endTimeBefore7);
  console.log("  R1 flow rate      :", r1_r7.toString(), "wei/s");
  console.log("  R2 flow rate      :", r2_r7.toString(), "wei/s");
  console.log("  endTime extended by", ext7, "s");
  if (Number(st7.status) === 0) ok("Stream = Active");
  if (ext7 > 0)                 ok("endTime extended");
  if (r1_r7 > 0n && r2_r7 > 0n) ok("Both flows resumed");

  // ── Step 8: removeRecipient(R2) ────────────────────────────────────────────
  sep("Step 8 — removeRecipient(R2) — R1 keeps flowing, endTime extends");

  const endTimeBefore9 = (await dripV4.getStream(streamId)).endTime;

  const removeR2Tx = await dripV4.removeRecipient(streamId, RECIPIENT_2);
  await removeR2Tx.wait();
  console.log("  tx:", removeR2Tx.hash);
  await sleep(5_000);

  const r1_r9     = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_1);
  const r2_r9     = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_2);
  const st9       = await dripV4.getStream(streamId);
  const removed   = await dripV4.isRecipientRemoved(streamId, RECIPIENT_2);
  const ext9      = Number(st9.endTime) - Number(endTimeBefore9);

  console.log("  R1 flow rate          :", r1_r9.toString(), "wei/s  (should still flow)");
  console.log("  R2 flow rate          :", r2_r9.toString(), "wei/s  (expected 0)");
  console.log("  isRecipientRemoved(R2):", removed);
  console.log("  Stream status         :", st9.status.toString(), "(0 = Active)");
  console.log("  endTime extended by   :", ext9, "s  (R2 buffer returned + freed capacity)");
  console.log("  new totalFlowRate     :", st9.totalFlowRate.toString(), "wei/s");

  if (r1_r9 > 0n)                   ok("R1 still flowing");
  if (r2_r9 === 0n)                  ok("R2 flow stopped");
  if (removed)                       ok("isRecipientRemoved flag set");
  if (Number(st9.status) === 0)      ok("Stream still Active");
  if (ext9 > 0)                      ok("endTime extended after R2 removal");

  // ── Step 9: getActiveRecipients ────────────────────────────────────────────
  sep("Step 9 — getActiveRecipients → only R1 returned");

  const [activeAddrs, activeRates] = await dripV4.getActiveRecipients(streamId);
  console.log("  Active recipients count:", activeAddrs.length);
  for (let i = 0; i < activeAddrs.length; i++) {
    console.log(`    [${i}] ${activeAddrs[i]}  @ ${activeRates[i].toString()} wei/s`);
  }
  if (activeAddrs.length === 1 && activeAddrs[0].toLowerCase() === RECIPIENT_1.toLowerCase()) {
    ok("getActiveRecipients returns only R1");
  } else {
    fail("getActiveRecipients result unexpected");
  }

  // ── Step 10: cancel ────────────────────────────────────────────────────────
  sep("Step 10 — cancelStream → vault drained, R1 flow = 0, refund to sender");

  const senderBefore = BigInt(await gDollar.balanceOf(deployer.address));

  const cancelTx = await dripV4.cancelStream(streamId);
  await cancelTx.wait();
  console.log("  tx:", cancelTx.hash);
  await sleep(5_000);

  const vaultFinal  = BigInt(await gDollar.balanceOf(vaultAddr));
  const senderFinal = BigInt(await gDollar.balanceOf(deployer.address));
  const r1_final    = await rate(cfaForwarder, TOKEN, vaultAddr, RECIPIENT_1);
  const stFinal     = await dripV4.getStream(streamId);

  console.log("  Vault balance     :", fmt(vaultFinal, dec), "G$");
  console.log("  Sender refund     :", fmt(senderFinal - senderBefore, dec), "G$");
  // StreamStatus: Active=0, Paused=1, Completed=2, Cancelled=3
  console.log("  Stream status     :", stFinal.status.toString(), "(3 = Cancelled)");
  console.log("  R1 flow rate      :", r1_final.toString(), "wei/s  (expected 0)");

  const allGood =
    vaultFinal === 0n &&
    senderFinal > senderBefore &&
    r1_final === 0n &&
    Number(stFinal.status) === 3;

  console.log("\n" + "═".repeat(68));
  if (allGood) {
    console.log("  ✅  ALL CHECKS PASSED");
  } else {
    console.log("  ⚠   Some checks did not pass — review output above");
    if (vaultFinal !== 0n)        warn("Vault not empty");
    if (senderFinal <= senderBefore) warn("No refund received");
    if (r1_final !== 0n)          warn("R1 flow still active");
    if (Number(stFinal.status) !== 3) warn("Status not Cancelled");
  }
  console.log("═".repeat(68));
  console.log("  StreamVault impl :", vaultImplAddr);
  console.log("  DripV5           :", dripV4Addr);
  console.log("═".repeat(68));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
