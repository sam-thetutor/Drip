// Standalone test for Privy email -> embedded wallet resolution.
//
// Verifies the exact logic the /api/privy/resolve-email route uses:
//   1. look up an existing Privy user by email
//   2. else pre-generate an embedded Ethereum wallet for that email
//   3. extract the wallet address
//   4. re-run to confirm the SAME address comes back (idempotency)
//
// Usage (from apps/web):
//   1. Add PRIVY_APP_SECRET to apps/web/.env.local
//   2. node scripts/test-email-wallet.mjs someone@example.com [another@example.com ...]
//      (no email arg -> a unique throwaway address is generated)

import { readFileSync } from "node:fs";
import { PrivyClient } from "@privy-io/server-auth";

// ---- minimal .env.local loader (so we don't need dotenv) --------------------
function loadEnvLocal() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* no .env.local — rely on real env */
  }
}
loadEnvLocal();

const APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID || "";
const APP_SECRET = process.env.PRIVY_APP_SECRET || "";

if (!APP_ID || !APP_SECRET) {
  console.error(
    "\n❌ Missing credentials. Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET " +
      "in apps/web/.env.local (or the environment).\n",
  );
  process.exit(1);
}

// Same extraction logic as the API route.
function embeddedEthAddress(user) {
  const accounts = user?.linkedAccounts ?? [];
  const wallets = accounts.filter(
    (a) =>
      a.type === "wallet" &&
      (a.chainType === "ethereum" || a.chain_type === "ethereum"),
  );
  const embedded =
    wallets.find(
      (w) => w.walletClientType === "privy" || w.walletClient === "privy",
    ) ?? wallets[0];
  return embedded?.address ?? user?.wallet?.address ?? null;
}

async function resolve(privy, email) {
  const existing = await privy.getUserByEmail(email);
  if (existing) {
    const addr = embeddedEthAddress(existing);
    if (addr) return { address: addr, isNew: false, privyUserId: existing.id };
    const updated = await privy.importUser({
      linkedAccounts: [{ type: "email", address: email }],
      createEthereumWallet: true,
    });
    return { address: embeddedEthAddress(updated), isNew: false, privyUserId: updated.id };
  }
  const created = await privy.importUser({
    linkedAccounts: [{ type: "email", address: email }],
    createEthereumWallet: true,
  });
  return { address: embeddedEthAddress(created), isNew: true, privyUserId: created.id };
}

async function main() {
  const privy = new PrivyClient(APP_ID, APP_SECRET);

  let emails = process.argv.slice(2).filter(Boolean);
  if (emails.length === 0) {
    const rand = Math.random().toString(36).slice(2, 10);
    emails = [`drip-test-${rand}@example.com`];
    console.log(`No email given — using throwaway: ${emails[0]}`);
  }

  console.log(`\nApp ID: ${APP_ID.slice(0, 6)}…  (secret ${APP_SECRET ? "set" : "MISSING"})\n`);

  let allOk = true;
  for (const email of emails) {
    console.log(`── ${email} ────────────────────────────────────────`);
    try {
      const first = await resolve(privy, email);
      console.log(`  1st call:  ${first.address}  (${first.isNew ? "NEW wallet" : "existing"})`);
      console.log(`             privyUserId=${first.privyUserId}`);

      const second = await resolve(privy, email);
      console.log(`  2nd call:  ${second.address}  (${second.isNew ? "NEW" : "existing"})`);

      const valid = /^0x[a-fA-F0-9]{40}$/.test(first.address || "");
      const stable = first.address && first.address === second.address;
      console.log(
        `  ✓ valid 0x address: ${valid ? "yes" : "NO"} | ✓ idempotent (same on re-run): ${stable ? "yes" : "NO"}`,
      );
      if (!valid || !stable) allOk = false;
    } catch (e) {
      allOk = false;
      console.log(`  ❌ ERROR: ${e?.message || e}`);
      if (e?.response?.data) console.log(`     detail: ${JSON.stringify(e.response.data)}`);
    }
    console.log("");
  }

  console.log(allOk ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED");
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
