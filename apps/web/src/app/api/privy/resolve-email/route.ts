import { NextResponse } from "next/server";
import { PrivyClient, type User } from "@privy-io/server-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolve a recipient email → an embedded wallet address so funds can be
 * streamed to people who don't have a wallet yet.
 *
 * - If the email already has a Privy account, return its embedded wallet.
 * - Otherwise pre-generate an embedded Ethereum wallet linked to that email.
 *   The recipient claims it later simply by logging into Drip with that email.
 *
 * Env (server-only — never commit):
 *   NEXT_PUBLIC_PRIVY_APP_ID  Privy app id (shared with the client)
 *   PRIVY_APP_SECRET          Privy app secret from the Privy dashboard
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pull the embedded (Privy-managed) Ethereum wallet address out of a User. */
function embeddedEthAddress(user: User): `0x${string}` | null {
  const accounts = (user.linkedAccounts ?? []) as unknown as Array<
    Record<string, unknown>
  >;
  const wallets = accounts.filter(
    (a) =>
      a.type === "wallet" &&
      (a.chainType === "ethereum" || a.chain_type === "ethereum"),
  );
  // Prefer the Privy-embedded wallet over any externally-linked one.
  const embedded =
    wallets.find(
      (w) => w.walletClientType === "privy" || w.walletClient === "privy",
    ) ?? wallets[0];
  const addr = (embedded?.address ??
    (user as unknown as { wallet?: { address?: string } }).wallet?.address) as
    | string
    | undefined;
  return addr && /^0x[a-fA-F0-9]{40}$/.test(addr) ? (addr as `0x${string}`) : null;
}

export async function POST(req: Request) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const appSecret = process.env.PRIVY_APP_SECRET ?? "";

  if (!appId || !appSecret) {
    return NextResponse.json(
      { error: "Privy server credentials not configured (PRIVY_APP_SECRET)" },
      { status: 500 },
    );
  }

  let email: string;
  try {
    const body = (await req.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const privy = new PrivyClient(appId, appSecret);

  try {
    // 1) Existing user?
    const existing = await privy.getUserByEmail(email);
    if (existing) {
      const address = embeddedEthAddress(existing);
      if (address) {
        return NextResponse.json({ address, email, isNew: false });
      }
      // User exists but has no embedded eth wallet — pre-generate one for them.
      const updated = await privy.importUser({
        linkedAccounts: [{ type: "email", address: email }],
        createEthereumWallet: true,
      });
      const newAddr = embeddedEthAddress(updated);
      if (newAddr) return NextResponse.json({ address: newAddr, email, isNew: false });
      return NextResponse.json(
        { error: "Could not resolve a wallet for this email" },
        { status: 502 },
      );
    }

    // 2) New recipient — pre-generate an embedded wallet linked to the email.
    const created = await privy.importUser({
      linkedAccounts: [{ type: "email", address: email }],
      createEthereumWallet: true,
    });
    const address = embeddedEthAddress(created);
    if (!address) {
      return NextResponse.json(
        { error: "Wallet creation succeeded but no address was returned" },
        { status: 502 },
      );
    }
    return NextResponse.json({ address, email, isNew: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to resolve email";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
