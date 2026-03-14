import { ethers } from "hardhat";

// ─── Addresses ────────────────────────────────────────────────────────────────

const PROXY_ADDRESS   = "0x5530975fDe062FE6706298fF3945E3d1a17A310a";
const G_DOLLAR_CELO   = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";

// ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
const TRANSFER_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Celo mainnet block the proxy was first deployed/upgraded to DripCoreV3.
// Using a conservative start block to avoid scanning from genesis.
// DripCoreV3 upgrade tx was on 13 March 2026 — block ~38_200_000 approx.
// We start a bit earlier to catch any pre-upgrade deposits.
const FROM_BLOCK = 37_000_000;

// How many blocks to fetch per request (Celo RPC limit is typically 2000-10000)
const CHUNK_SIZE = 2_000;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { chainId } = await ethers.provider.getNetwork();

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  G$ Volume Tracker — DripCoreV3 Proxy");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Network   :", chainId.toString());
  console.log("  Proxy     :", PROXY_ADDRESS);
  console.log("  G$ Token  :", G_DOLLAR_CELO);
  console.log();

  const token = new ethers.Contract(G_DOLLAR_CELO, TRANSFER_ABI, ethers.provider);
  const decimals = await token.decimals();
  const symbol   = await token.symbol();
  const latestBlock = await ethers.provider.getBlockNumber();

  console.log(`  Token     : ${symbol} (${decimals} decimals)`);
  console.log(`  Scanning  : block ${FROM_BLOCK} → ${latestBlock}`);
  console.log();

  let inflow  = 0n; // G$ received by proxy (deposits, stakes)
  let outflow = 0n; // G$ sent by proxy (withdrawals, refunds, unstakes)
  let inCount  = 0;
  let outCount = 0;

  const proxy = PROXY_ADDRESS.toLowerCase();

  for (let start = FROM_BLOCK; start <= latestBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, latestBlock);

    const [inLogs, outLogs] = await Promise.all([
      // Transfers INTO the proxy
      token.queryFilter(token.filters.Transfer(null, PROXY_ADDRESS), start, end),
      // Transfers OUT of the proxy
      token.queryFilter(token.filters.Transfer(PROXY_ADDRESS, null), start, end),
    ]);

    for (const log of inLogs) {
      const amount = (log as any).args.value as bigint;
      inflow  += amount;
      inCount++;
    }
    for (const log of outLogs) {
      const amount = (log as any).args.value as bigint;
      outflow += amount;
      outCount++;
    }

    if ((start - FROM_BLOCK) % 20_000 < CHUNK_SIZE) {
      const pct = (((start - FROM_BLOCK) / (latestBlock - FROM_BLOCK)) * 100).toFixed(0);
      process.stdout.write(`\r  Progress: ${pct}% (block ${start})`);
    }
  }

  console.log("\n");

  const fmt = (v: bigint) =>
    parseFloat(ethers.formatUnits(v, decimals)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const totalVolume = inflow + outflow;

  console.log("─── Results ───────────────────────────────────────────────────");
  console.log(`  ${symbol} Received (inflow)  : ${fmt(inflow)} ${symbol}   (${inCount} txs)`);
  console.log(`  ${symbol} Sent     (outflow) : ${fmt(outflow)} ${symbol}   (${outCount} txs)`);
  console.log(`  ─────────────────────────────────────────────────────────────`);
  console.log(`  Total Gross Volume      : ${fmt(totalVolume)} ${symbol}`);
  console.log(`  Net Balance (in - out)  : ${fmt(inflow - outflow)} ${symbol}`);
  console.log("───────────────────────────────────────────────────────────────");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
