import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";

/**
 * Fonbnk pay-widget signed URL builder.
 *
 * Signs an HS256 JWT with the merchant URL-signature secret and returns a
 * fully-qualified https://pay.fonbnk.com/?source=…&signature=… URL the
 * client can open in a popup / new tab.
 *
 * Env vars (add to .env.local — never commit):
 *   FONBNK_SOURCE        Merchant "Source" identifier
 *   FONBNK_URL_SECRET    URL signature secret from Fonbnk dashboard
 *   FONBNK_WIDGET_BASE_URL  Optional override (default: https://pay.fonbnk.com)
 *
 * Query params accepted:
 *   address      User wallet address (pre-fills payout destination)
 *   asset        Crypto asset to receive (default: USDC)
 *   network      Network (default: CELO)
 *   amount       Optional fiat amount hint
 *   currency     Optional fiat currency code (e.g. UGX, KES, NGN)
 *   country      Optional ISO country code
 *   provider     Optional MoMo carrier
 *   freezeWallet Lock payout to `address` & skip Fonbnk's connect-wallet step
 *                (defaults to true when an address is supplied; pass "false" to allow change)
 *   redirectUrl  Where Fonbnk redirects after order completes
 *   callbackUrl  Server-to-server webhook URL
 */

function b64url(input: Buffer | string): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader  = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;
  const sig = createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

export async function GET(req: Request) {
  const source = process.env.FONBNK_SOURCE ?? "";
  const secret = process.env.FONBNK_URL_SECRET ?? "";

  if (!source || !secret) {
    return NextResponse.json(
      { error: "Fonbnk credentials not configured (FONBNK_SOURCE / FONBNK_URL_SECRET)" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("address")     ?? undefined;
  const asset         = searchParams.get("asset")       ?? "USDC";
  const network       = searchParams.get("network")     ?? "CELO";
  const orderAmount   = searchParams.get("amount")      ?? undefined;
  const currencyCode  = searchParams.get("currency")    ?? undefined;
  const country       = searchParams.get("country")     ?? undefined;
  const provider      = searchParams.get("provider")    ?? undefined;
  const redirectUrl   = searchParams.get("redirectUrl") ?? undefined;
  const callbackUrl   = searchParams.get("callbackUrl") ?? undefined;
  // When an address is supplied we lock it so the widget skips the
  // "Connect Your Wallet" step (default on, can be disabled with freezeWallet=false).
  const freezeWallet  = (searchParams.get("freezeWallet") ?? "true") !== "false";

  const widgetConfig: Record<string, string> = {
    ...(walletAddress ? { address: walletAddress, walletAddress }     : {}),
    ...(walletAddress && freezeWallet ? { freezeWallet: "true" }      : {}),
    ...(asset         ? { asset }                                     : {}),
    ...(network       ? { network }                                   : {}),
    ...(orderAmount   ? { orderAmount }                               : {}),
    ...(currencyCode  ? { currencyCode }                              : {}),
    ...(country       ? { country }                                   : {}),
    ...(provider      ? { provider }                                  : {}),
    ...(redirectUrl   ? { redirectUrl }                               : {}),
    ...(callbackUrl   ? { callbackUrl }                               : {}),
  };

  // uid must be unique per order so the signature can't be replayed
  const payload: Record<string, unknown> = { uid: randomUUID(), ...widgetConfig };
  const signature = signHs256Jwt(payload, secret);

  const base = process.env.FONBNK_WIDGET_BASE_URL ?? "https://pay.fonbnk.com";
  const qs   = new URLSearchParams({ source, signature, ...widgetConfig });
  const url  = `${base}/?${qs.toString()}`;

  return NextResponse.json({ url });
}
