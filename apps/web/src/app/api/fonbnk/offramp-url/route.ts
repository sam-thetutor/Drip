import { NextResponse } from "next/server";
import { createHmac, randomUUID } from "crypto";

/**
 * Fonbnk off-ramp signed URL builder.
 *
 * Opens the Fonbnk off-ramp widget where the user sends USDC from their
 * Celo wallet and receives mobile money (MTN / Airtel) in return.
 *
 * Uses the same HS256 JWT signing as the on-ramp widget-url route.
 * Widget base: https://pay.fonbnk.com/offramp
 *
 * Query params accepted:
 *   address      Wallet address USDC is sent FROM
 *   asset        Crypto asset to sell (default: USDC)
 *   network      Network (default: CELO)
 *   amount       Optional amount of crypto to sell (pre-fill)
 *   currency     Optional target fiat currency (e.g. UGX, KES, NGN)
 *   country      Optional ISO country code
 *   provider     Optional MoMo carrier
 *   redirectUrl  Where Fonbnk redirects after order completes
 *   callbackUrl  Server-to-server webhook URL
 */

function b64url(input: Buffer | string): string {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader   = b64url(JSON.stringify(header));
  const encPayload  = b64url(JSON.stringify(payload));
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

  const widgetConfig: Record<string, string> = {
    ...(walletAddress ? { address: walletAddress, walletAddress } : {}),
    ...(asset         ? { asset }                                  : {}),
    ...(network       ? { network }                                : {}),
    ...(orderAmount   ? { orderAmount }                            : {}),
    ...(currencyCode  ? { currencyCode }                           : {}),
    ...(country       ? { country }                                : {}),
    ...(provider      ? { provider }                               : {}),
    ...(redirectUrl   ? { redirectUrl }                            : {}),
    ...(callbackUrl   ? { callbackUrl }                            : {}),
    // Hide the buy/sell toggle — we're in sell-only mode
    hideSwitch: "true",
  };

  const payload: Record<string, unknown> = { uid: randomUUID(), ...widgetConfig };
  const signature = signHs256Jwt(payload, secret);

  const base = process.env.FONBNK_WIDGET_BASE_URL ?? "https://pay.fonbnk.com";
  const qs   = new URLSearchParams({ source, signature, ...widgetConfig });
  const url  = `${base}/offramp?${qs.toString()}`;

  return NextResponse.json({ url });
}
