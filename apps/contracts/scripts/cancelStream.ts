/**
 * Cancel an existing DripV4 stream.
 * Usage: npx hardhat run scripts/cancelStream.ts --network celo
 */
import { ethers } from "hardhat";

const DRIP_V4    = "0xB6E492f45Af28d72B344Ca188d97e2E9a0291325";
const STREAM_ID  = 1;

const DRIP_ABI = [
  "function cancelStream(uint256 streamId) external",
  "function getStream(uint256 streamId) external view returns (tuple(uint256 streamId, address sender, address recipient, address token, int96 flowRate, uint256 startTime, uint256 cancelTime, uint8 status, string title))",
  "function getLiveFlowRate(uint256 streamId) external view returns (int96)",
];

const CFA_ABI = [
  "function getFlowrate(address token, address sender, address receiver) external view returns (int96)",
];

const CFA_FORWARDER = "0xcfA132E353cB4E398080B9700609bb008eceB125";

async function main() {
  const [signer] = await ethers.getSigners();
  const dripV4  = new ethers.Contract(DRIP_V4, DRIP_ABI, signer);
  const cfa     = new ethers.Contract(CFA_FORWARDER, CFA_ABI, signer);

  console.log("═══════════════════════════════════════");
  console.log("  Cancel DripV4 Stream");
  console.log("═══════════════════════════════════════");
  console.log("  DripV4   :", DRIP_V4);
  console.log("  StreamId :", STREAM_ID);
  console.log("  Signer   :", signer.address);

  // Read stream state
  const stream = await dripV4.getStream(STREAM_ID);
  console.log("\n  Stream details:");
  console.log("    sender    :", stream.sender);
  console.log("    recipient :", stream.recipient);
  console.log("    token     :", stream.token);
  console.log("    flowRate  :", stream.flowRate.toString(), "wei/s");
  console.log("    status    :", stream.status === 0n ? "Active" : "Cancelled");
  console.log("    title     :", stream.title);

  // Check live rate from Superfluid
  const liveRate = await cfa.getFlowrate(stream.token, stream.sender, stream.recipient).catch(() => "n/a");
  console.log("\n  Superfluid live rate:", liveRate.toString(), "wei/s");

  if (stream.status !== 0n) {
    console.log("\n  Stream is already cancelled. Nothing to do.");
    return;
  }

  // Cancel
  console.log("\n  Cancelling stream...");
  const tx = await dripV4.cancelStream(STREAM_ID);
  const receipt = await tx.wait();
  console.log("  ✓ cancelStream Tx:", tx.hash);

  // Verify stopped
  await new Promise(r => setTimeout(r, 3000));
  const finalRate = await cfa.getFlowrate(stream.token, stream.sender, stream.recipient).catch(() => 0n);
  console.log("  Final Superfluid rate:", finalRate.toString(), "wei/s");
  console.log(finalRate === 0n ? "  ✓ Stream fully stopped." : "  ⚠  Stream may still be active.");
}

main().catch(err => { console.error(err); process.exitCode = 1; });
