/**
 * keeper.ts — DripV4 stream expiry keeper
 *
 * Responsibilities:
 *   1. On startup: scan all streams via streamCount + getStream, storing full
 *      stream details (vault, token, sender, flowRate, endTime) for each active stream.
 *   2. Set a precision timer for each stream that fires at its endTime.
 *   3. At fire time: check the vault's Superfluid available balance.
 *      - If availableBalance > 0  → stream still has tokens, reschedule and wait.
 *      - If availableBalance <= 0 → call expireStream() immediately.
 *   4. Fallback polling every POLL_INTERVAL_MS as a safety net.
 *   5. Listen to on-chain events to keep state accurate in real-time.
 *
 * The keeper never holds tokens and needs no special permissions.
 * It only needs a small amount of CELO to pay gas for expireStream().
 *
 * Config (keeper/.env):
 *   RPC_URL          Celo RPC endpoint (default: https://forno.celo.org)
 *   DRIP_V4_ADDR     Deployed DripV4 contract address
 *   PRIVATE_KEY      Keeper wallet private key (needs CELO for gas)
 *   POLL_INTERVAL_MS Fallback poll interval ms (default: 30_000)
 *   START_BLOCK      Block to scan events from on first run (set to deploy block)
 *
 * Run:
 *   npm run dev        (ts-node, for testing)
 *   npm run build && npm start  (compiled, for production)
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const RPC_URL          = process.env.RPC_URL          ?? "https://forno.celo.org";
const DRIP_V4_ADDR     = process.env.DRIP_V4_ADDR     ?? "";
const PRIVATE_KEY      = process.env.PRIVATE_KEY      ?? "";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? "30000");

if (!DRIP_V4_ADDR) throw new Error("DRIP_V4_ADDR not set");
if (!PRIVATE_KEY)  throw new Error("PRIVATE_KEY not set");

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const DRIP_V4_ABI = [
  // Events
  "event StreamCreated(uint256 indexed streamId, address indexed sender, address indexed token, address[] recipients, int96[] flowRates, int96 totalFlowRate, uint256 totalAmount, uint256 depositAmount, uint256 feeAmount, address vault, uint256 startTime, uint256 endTime, string title)",
  "event StreamCancelled(uint256 indexed streamId, address indexed vault, uint256 refundAmount, uint256 finishTime)",
  "event StreamCompleted(uint256 indexed streamId, address indexed vault, uint256 finishTime)",
  "event StreamResumed(uint256 indexed streamId, uint256 newEndTime)",
  "event StreamToppedUp(uint256 indexed streamId, uint256 newEndTime)",

  // Functions
  "function expireStream(uint256 streamId) external",
  "function streamCount() external view returns (uint256)",
  "function getStream(uint256 streamId) external view returns (tuple(uint256 streamId, address sender, address[] recipients, address token, int96[] flowRates, int96 totalFlowRate, uint256 totalAmount, uint256 depositAmount, address vault, uint256 startTime, uint256 endTime, uint256 finishTime, uint256 pausedAt, uint256 rateLockUntil, uint8 status, string title, string description))",
];

// ISuperToken — only the balance check we need
const SUPER_TOKEN_ABI = [
  "function realtimeBalanceOfNow(address account) external view returns (int256 availableBalance, uint256 deposit, uint256 owedDeposit, uint256 timestamp)",
];

// StreamStatus enum — mirrors DripV4.sol: Active=0, Paused=1, Completed=2, Cancelled=3
// ethers.js v6 returns all integer ABI types (incl. uint8) as BigInt, so use BigInt here.
const STATUS_ACTIVE = 0n;

// ─── Types ────────────────────────────────────────────────────────────────────

interface StreamDetails {
  streamId:      bigint;
  sender:        string;
  vault:         string;
  token:         string;
  totalFlowRate: bigint;   // wei/sec — used to estimate time remaining if balance > 0
  startTime:     bigint;
  endTime:       bigint;
  title:         string;
}

interface TrackedStream extends StreamDetails {
  timer: ReturnType<typeof setTimeout> | null;
}

// ─── State ────────────────────────────────────────────────────────────────────

const tracked = new Map<string, TrackedStream>(); // key = streamId.toString()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function key(streamId: bigint): string {
  return streamId.toString();
}

function fmtDate(ts: bigint): string {
  return new Date(Number(ts) * 1000).toISOString();
}

function fmtTokens(wei: bigint, decimals = 18): string {
  const d = 10n ** BigInt(decimals);
  const whole = wei / d;
  const frac  = (wei < 0n ? -wei : wei) % d;
  return `${whole}.${frac.toString().padStart(decimals, "0").slice(0, 4)}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(DRIP_V4_ADDR, DRIP_V4_ABI, signer);

  const keeperAddr = await signer.getAddress();
  log(`Keeper wallet  : ${keeperAddr}`);
  log(`DripV4         : ${DRIP_V4_ADDR}`);
  log(`RPC            : ${RPC_URL}`);
  log(`Fallback poll  : ${POLL_INTERVAL_MS / 1000}s`);

  const celoBalance = await provider.getBalance(keeperAddr);
  const celoEther   = parseFloat(ethers.formatEther(celoBalance));
  if (celoEther < 0.05) {
    log(`⚠  LOW CELO BALANCE: ${celoEther.toFixed(4)} CELO — top up soon`);
  } else {
    log(`CELO balance   : ${celoEther.toFixed(4)} CELO`);
  }

  // ── Balance check ─────────────────────────────────────────────────────────
  // Returns the Superfluid real-time available balance of the vault.
  // A positive value means the stream still has tokens left to flow.
  // Zero or negative means the stream has run dry — expire it.

  async function getVaultAvailableBalance(token: string, vault: string): Promise<bigint> {
    try {
      const superToken = new ethers.Contract(token, SUPER_TOKEN_ABI, provider);
      const [availableBalance] = await superToken.realtimeBalanceOfNow(vault);
      return availableBalance as bigint;
    } catch {
      // If the token doesn't support realtimeBalanceOfNow, fall back to raw balanceOf
      const erc20 = new ethers.Contract(
        token,
        ["function balanceOf(address) view returns (uint256)"],
        provider,
      );
      return (await erc20.balanceOf(vault)) as bigint;
    }
  }

  // ── Core: check balance then expire ──────────────────────────────────────

  async function checkAndExpire(streamId: bigint) {
    const s = tracked.get(key(streamId));
    if (!s) return; // already untracked

    log(`  stream ${streamId}: checking vault balance before expiry…`);

    const availBal = await getVaultAvailableBalance(s.token, s.vault).catch(() => 0n);

    if (availBal > 0n) {
      // Vault still has balance — stream was topped up or endTime was stale.
      // Re-estimate when it will run dry and reschedule.
      const secsRemaining = s.totalFlowRate > 0n
        ? availBal / s.totalFlowRate
        : 30n;

      log(
        `  stream ${streamId}: vault still has ${fmtTokens(availBal)} tokens` +
        ` (~${secsRemaining}s left) — rescheduling`,
      );

      const newEndTime = BigInt(Math.floor(Date.now() / 1000)) + secsRemaining;
      reschedule(s, newEndTime);
      return;
    }

    // Available balance is zero or negative — expire now.
    log(`  stream ${streamId}: vault available balance = ${fmtTokens(availBal)} — expiring`);
    await doExpire(streamId);
  }

  async function doExpire(streamId: bigint) {
    try {
      const tx      = await contract.expireStream(streamId);
      const receipt = await tx.wait();
      log(`  ✓ expireStream(${streamId}) mined — tx: ${receipt.hash}`);
      untrack(streamId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not active") || msg.includes("not found") || msg.includes("DripV4:")) {
        log(`  ℹ  stream ${streamId} already closed on-chain`);
        untrack(streamId);
      } else {
        log(`  ✗ expireStream(${streamId}) failed: ${msg} — retrying in 10s`);
        const s = tracked.get(key(streamId));
        if (s) s.timer = setTimeout(() => checkAndExpire(streamId), 10_000);
      }
    }
  }

  // ── Tracking helpers ─────────────────────────────────────────────────────

  function scheduleTimer(s: TrackedStream): ReturnType<typeof setTimeout> {
    const now     = BigInt(Math.floor(Date.now() / 1000));
    const msUntil = Number(s.endTime - now) * 1000;

    if (msUntil <= 0) {
      log(
        `  stream ${s.streamId} [${s.title || "untitled"}]` +
        ` sender=${s.sender} vault=${s.vault}` +
        ` — past endTime, checking balance immediately`,
      );
      return setTimeout(() => checkAndExpire(s.streamId), 500);
    }

    log(
      `  stream ${s.streamId} [${s.title || "untitled"}]` +
      ` sender=${s.sender}` +
      ` vault=${s.vault}` +
      ` endTime=${fmtDate(s.endTime)} (~${Math.ceil(msUntil / 1000)}s)` +
      ` — precision timer set`,
    );
    // Fire at endTime + 2s to give the chain time to advance past it
    return setTimeout(() => checkAndExpire(s.streamId), msUntil + 2_000);
  }

  function track(details: StreamDetails) {
    const k = key(details.streamId);

    // Cancel any existing timer
    const existing = tracked.get(k);
    if (existing?.timer) clearTimeout(existing.timer);

    const entry: TrackedStream = { ...details, timer: null };
    entry.timer = scheduleTimer(entry);
    tracked.set(k, entry);
  }

  function untrack(streamId: bigint) {
    const k = key(streamId);
    const s = tracked.get(k);
    if (s?.timer) clearTimeout(s.timer);
    if (tracked.delete(k)) {
      log(`  Removed stream ${streamId} from tracking (${tracked.size} remaining)`);
    }
  }

  function reschedule(s: TrackedStream, newEndTime: bigint) {
    s.endTime = newEndTime;
    if (s.timer) clearTimeout(s.timer);
    s.timer = scheduleTimer(s);
  }

  function updateEndTime(streamId: bigint, newEndTime: bigint) {
    const s = tracked.get(key(streamId));
    if (!s) return;
    log(`  stream ${streamId}: endTime updated → ${fmtDate(newEndTime)}`);
    reschedule(s, newEndTime);
  }

  // ── Backfill: streamCount + getStream ─────────────────────────────────────

  log("\nBackfilling via streamCount + getStream…");
  const count = Number(await contract.streamCount());
  log(`Total streams on-chain: ${count}`);

  const BATCH = 10;
  for (let i = 1; i <= count; i += BATCH) {
    const ids     = Array.from({ length: Math.min(BATCH, count - i + 1) }, (_, j) => i + j);
    const results = await Promise.all(ids.map((id) => contract.getStream(id).catch(() => null)));

    for (const s of results) {
      if (!s || s.streamId === 0n) continue;
      if (s.status !== STATUS_ACTIVE) continue;

      track({
        streamId:      s.streamId,
        sender:        s.sender,
        vault:         s.vault,
        token:         s.token,
        totalFlowRate: s.totalFlowRate,
        startTime:     s.startTime,
        endTime:       s.endTime,
        title:         s.title,
      });
    }
  }

  log(`Backfill complete. Tracking ${tracked.size} active stream(s).\n`);

  // ── Real-time event polling ───────────────────────────────────────────────
  // Celo's forno HTTP RPC doesn't support persistent filters reliably, and
  // per-block getLogs is too expensive. Instead we make ONE batched getLogs
  // call every EVENT_POLL_MS covering all events since the last checked block.

  const EVENT_POLL_MS = 30_000; // same cadence as the fallback poll
  let lastCheckedBlock = await provider.getBlockNumber();

  async function pollEvents() {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastCheckedBlock) return;

      const fromBlock = lastCheckedBlock + 1;
      const toBlock   = currentBlock;
      lastCheckedBlock = currentBlock;

      // Fetch all DripV4 events in one getLogs call, then parse by topic
      const allEvents = await contract.queryFilter("*", fromBlock, toBlock);

      for (const e of allEvents) {
        if (!(e instanceof ethers.EventLog)) continue;
        const name = e.fragment?.name;
        const a    = e.args;

        if (name === "StreamCreated") {
          log(`[event] StreamCreated  id=${a.streamId}  endTime=${fmtDate(a.endTime)}  title="${a.title}"`);
          track({
            streamId:      a.streamId,
            sender:        a.sender,
            vault:         a.vault,
            token:         a.token,
            totalFlowRate: a.totalFlowRate,
            startTime:     a.startTime,
            endTime:       a.endTime,
            title:         a.title,
          });
        } else if (name === "StreamCancelled") {
          log(`[event] StreamCancelled id=${a.streamId}`);
          untrack(a.streamId);
        } else if (name === "StreamCompleted") {
          log(`[event] StreamCompleted id=${a.streamId}`);
          untrack(a.streamId);
        } else if (name === "StreamResumed") {
          log(`[event] StreamResumed   id=${a.streamId}  newEndTime=${fmtDate(a.newEndTime)}`);
          updateEndTime(a.streamId, a.newEndTime);
        } else if (name === "StreamToppedUp") {
          log(`[event] StreamToppedUp  id=${a.streamId}  newEndTime=${fmtDate(a.newEndTime)}`);
          updateEndTime(a.streamId, a.newEndTime);
        }
      }
    } catch (err) {
      log(`[pollEvents] getLogs error: ${err instanceof Error ? err.message : err}`);
    }
  }

  setInterval(pollEvents, EVENT_POLL_MS);

  // ── Fallback polling ──────────────────────────────────────────────────────

  async function fallbackPoll() {
    if (tracked.size === 0) return;

    const now = BigInt(Math.floor(Date.now() / 1000));
    for (const s of [...tracked.values()]) {
      if (now >= s.endTime) {
        log(`[fallback] stream ${s.streamId} overdue — checking balance`);
        await checkAndExpire(s.streamId);
      }
    }
  }

  setInterval(fallbackPoll, POLL_INTERVAL_MS);

  // ── Health-check HTTP server ───────────────────────────────────────────────
  // GET /health → 200 { ok, uptime, tracked, lastBlock, ts }
  // Used by external monitors (UptimeRobot, BetterStack, etc.) and the
  // dead-man Telegram alert below.

  const HEALTH_PORT     = Number(process.env.HEALTH_PORT ?? "3001");
  const TG_BOT_TOKEN    = process.env.TG_BOT_TOKEN ?? "";
  const TG_CHAT_ID      = process.env.TG_CHAT_ID   ?? "";
  // Alert if no block has been processed in this many minutes (default: 10)
  const DEADMAN_MINUTES = Number(process.env.DEADMAN_MINUTES ?? "10");

  let lastActivityAt = Date.now();
  let lastBlockSeen  = 0;

  // Wrap provider block listener to track liveness
  provider.on("block", (blockNumber: number) => {
    lastActivityAt = Date.now();
    lastBlockSeen  = blockNumber;
  });

  // HTTP health endpoint
  const http = await import("http");
  const healthServer = http.createServer((_req, res) => {
    const status = {
      ok:        true,
      uptime:    Math.floor(process.uptime()),
      tracked:   tracked.size,
      lastBlock: lastBlockSeen,
      lastSeen:  new Date(lastActivityAt).toISOString(),
      ts:        new Date().toISOString(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  });
  healthServer.listen(HEALTH_PORT, () => {
    log(`Health endpoint listening on :${HEALTH_PORT}/health`);
  });

  // Dead-man Telegram alert
  async function sendTelegram(text: string) {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
    try {
      const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
      const body = JSON.stringify({ chat_id: TG_CHAT_ID, text, parse_mode: "Markdown" });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) log(`[tg] alert send failed: ${res.status}`);
    } catch (e) {
      log(`[tg] alert error: ${e}`);
    }
  }

  let alertedDead = false;
  setInterval(async () => {
    const silentMs = Date.now() - lastActivityAt;
    if (silentMs > DEADMAN_MINUTES * 60_000) {
      if (!alertedDead) {
        alertedDead = true;
        const msg = `🚨 *DripV4 Keeper silent for ${Math.round(silentMs / 60_000)} min*\nLast block: ${lastBlockSeen}\nTime: ${new Date().toISOString()}`;
        log(`[deadman] ${msg}`);
        await sendTelegram(msg);
      }
    } else {
      if (alertedDead) {
        alertedDead = false;
        await sendTelegram(`✅ *DripV4 Keeper recovered* — activity resumed at block ${lastBlockSeen}`);
      }
    }
  }, 60_000); // check every minute

  // ── Graceful shutdown ─────────────────────────────────────────────────────

  function shutdown(sig: string) {
    log(`\nReceived ${sig} — shutting down`);
    for (const s of tracked.values()) {
      if (s.timer) clearTimeout(s.timer);
    }
    provider.destroy();
    process.exit(0);
  }

  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  log("Keeper running. Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error("Fatal keeper error:", err);
  process.exit(1);
});
