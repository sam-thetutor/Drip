#!/usr/bin/env node
/**
 * Relworx collection (request-to-pay) test script.
 *
 * Sends a mobile-money payment request to a phone number. The user gets a PIN
 * prompt on their phone; the final result arrives async (we poll status here).
 *
 * Usage:
 *   RELWORX_API_KEY=xxx RELWORX_ACCOUNT_NO=RELxxxx \
 *     node scripts/relworx/collect.mjs <msisdn> <amount> [currency]
 *
 * Example:
 *   RELWORX_API_KEY=... RELWORX_ACCOUNT_NO=... \
 *     node scripts/relworx/collect.mjs +256701234567 500 UGX
 *
 * Env:
 *   RELWORX_API_KEY     (required) Bearer API key from the Relworx dashboard
 *   RELWORX_ACCOUNT_NO  (required) Your business account number
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

if (!API_KEY) fail("Set RELWORX_API_KEY (your Bearer API key).");
if (!ACCOUNT_NO) fail("Set RELWORX_ACCOUNT_NO (your business account number).");
if (!msisdn || !msisdn.startsWith("+")) fail("Pass an internationally-formatted phone, e.g. +256701234567");
if (!amount || amount <= 0) fail("Pass a positive amount, e.g. 500");

const headers = {
  "Content-Type": "application/json",
  Accept: "application/vnd.relworx.v2",
  Authorization: `Bearer ${API_KEY}`,
};

// reference must be unique, 8–36 chars. "drip" + 32 hex = 36 chars.
const reference = ("drip" + randomUUID().replace(/-/g, "")).slice(0, 36);

async function requestPayment() {
  const body = {
    account_no: ACCOUNT_NO,
    reference,
    msisdn,
    currency,
    amount,
    description: "Drip Relworx test collection",
  };

  console.log("→ POST /mobile-money/request-payment");
  console.log("  reference:", reference);
  console.log("  body:", JSON.stringify({ ...body }, null, 2));

  const res = await fetch(`${BASE}/mobile-money/request-payment`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }

  console.log(`\n← HTTP ${res.status}`);
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok || !json?.success) fail("Request failed — see response above.");
  return json.internal_reference;
}

async function checkStatus(internalReference) {
  const url = new URL(`${BASE}/mobile-money/check-request-status`);
  url.searchParams.set("account_no", ACCOUNT_NO);
  url.searchParams.set("internal_reference", internalReference);

  const res = await fetch(url, { method: "GET", headers });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function pollStatus(internalReference) {
  console.log("\n⏳ Polling status (user should approve the PIN prompt on their phone)...");
  const maxTries = 20;          // ~ up to 100s
  const delayMs = 5000;
  for (let i = 1; i <= maxTries; i++) {
    const { status, json } = await checkStatus(internalReference);
    const reqStatus = json?.request_status || json?.status || "unknown";
    console.log(`  [${i}/${maxTries}] HTTP ${status} → status=${reqStatus}`);
    if (["success", "failed"].includes(reqStatus)) {
      console.log("\nFinal status payload:");
      console.log(JSON.stringify(json, null, 2));
      return reqStatus;
    }
    if (i < maxTries) await new Promise((r) => setTimeout(r, delayMs));
  }
  console.log("\n⌛ Still pending after polling window — check the dashboard / webhook.");
}

(async () => {
  const internalReference = await requestPayment();
  if (process.env.RELWORX_POLL === "0") {
    console.log(`\nℹ️  Skipping poll. internal_reference: ${internalReference}`);
    return;
  }
  await pollStatus(internalReference);
})().catch((e) => fail(e?.stack || String(e)));
