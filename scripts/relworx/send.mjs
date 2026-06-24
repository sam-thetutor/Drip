#!/usr/bin/env node
/**
 * Relworx send-payment (disbursement / payout) test script.
 *
 * Sends money FROM your Relworx wallet balance TO a phone number. Your account
 * must hold enough float. Result is async (we poll status).
 *
 * Usage:
 *   RELWORX_API_KEY=xxx RELWORX_ACCOUNT_NO=RELxxxx \
 *     node scripts/relworx/send.mjs <msisdn> <amount> [currency]
 *
 * Example:
 *   RELWORX_API_KEY=... RELWORX_ACCOUNT_NO=... \
 *     node scripts/relworx/send.mjs +256774073262 500 UGX
 *
 * Env:
 *   RELWORX_API_KEY     (required) Bearer API key (must match the account)
 *   RELWORX_ACCOUNT_NO  (required) Business account number the key belongs to
 *   RELWORX_BASE_URL    (optional) defaults to https://payments.relworx.com/api
 *   RELWORX_POLL        (optional) "0" to skip status polling
 */

import { randomUUID } from "node:crypto";

const BASE = process.env.RELWORX_BASE_URL || "https://payments.relworx.com/api";
const API_KEY = process.env.RELWORX_API_KEY;
const ACCOUNT_NO = process.env.RELWORX_ACCOUNT_NO;

const [, , msisdnArg, amountArg, currencyArg] = process.argv;
const msisdn = msisdnArg;
const amount = amountArg ? Number(amountArg) : undefined;
const currency = (currencyArg || "UGX").toUpperCase();

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

if (!API_KEY) fail("Set RELWORX_API_KEY (Bearer API key for this account).");
if (!ACCOUNT_NO) fail("Set RELWORX_ACCOUNT_NO (business account number).");
if (!msisdn || !msisdn.startsWith("+")) fail("Pass an internationally-formatted phone, e.g. +256701234567");
if (!amount || amount <= 0) fail("Pass a positive amount, e.g. 500");

const headers = {
  "Content-Type": "application/json",
  Accept: "application/vnd.relworx.v2",
  Authorization: `Bearer ${API_KEY}`,
};

const reference = ("drip" + randomUUID().replace(/-/g, "")).slice(0, 36);

async function checkBalance() {
  try {
    const url = new URL(`${BASE}/mobile-money/check-wallet-balance`);
    url.searchParams.set("account_no", ACCOUNT_NO);
    url.searchParams.set("currency", currency);
    const res = await fetch(url, { method: "GET", headers });
    const json = await res.json().catch(() => null);
    console.log(`💰 Wallet balance (${currency}):`, JSON.stringify(json));
  } catch {
    console.log("(could not read wallet balance — continuing)");
  }
}

async function sendPayment() {
  const body = {
    account_no: ACCOUNT_NO,
    reference,
    msisdn,
    currency,
    amount,
    description: "Drip Relworx test payout",
  };

  console.log("→ POST /mobile-money/send-payment");
  console.log("  reference:", reference);
  console.log("  body:", JSON.stringify(body, null, 2));

  const res = await fetch(`${BASE}/mobile-money/send-payment`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }

  console.log(`\n← HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok || !json?.success) fail("Send failed — see response above.");
  return json.internal_reference;
}

async function pollStatus(internalReference) {
  console.log("\n⏳ Polling payout status...");
  const maxTries = 20;
  const delayMs = 5000;
  for (let i = 1; i <= maxTries; i++) {
    const url = new URL(`${BASE}/mobile-money/check-request-status`);
    url.searchParams.set("account_no", ACCOUNT_NO);
    url.searchParams.set("internal_reference", internalReference);
    const res = await fetch(url, { method: "GET", headers });
    const json = await res.json().catch(() => ({}));
    const st = json?.request_status || json?.status || "unknown";
    console.log(`  [${i}/${maxTries}] HTTP ${res.status} → status=${st}`);
    if (["success", "failed"].includes(st)) {
      console.log("\nFinal status payload:");
      console.log(JSON.stringify(json, null, 2));
      return st;
    }
    if (i < maxTries) await new Promise((r) => setTimeout(r, delayMs));
  }
  console.log("\n⌛ Still pending after polling window — check the dashboard / webhook.");
}

(async () => {
  await checkBalance();
  const internalReference = await sendPayment();
  if (process.env.RELWORX_POLL === "0") {
    console.log(`\nℹ️  Skipping poll. internal_reference: ${internalReference}`);
    return;
  }
  await pollStatus(internalReference);
})().catch((e) => fail(e?.stack || String(e)));
