import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http } from "viem";
import { celo, celoAlfajores, celoSepolia } from "viem/chains";
import { OdisUtils } from "@celo/identity";
import { OdisContextName } from "@celo/identity/lib/odis/query";
import { AuthenticationMethod } from "@celo/identity/lib/odis/query";
import { newKit } from "@celo/contractkit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const federatedAttestationsAbi = [
  {
    type: "function",
    name: "lookupAttestations",
    stateMutability: "view",
    inputs: [
      { name: "identifier", type: "bytes32" },
      { name: "trustedIssuers", type: "address[]" },
    ],
    outputs: [
      { name: "accounts", type: "address[]" },
      { name: "signers", type: "address[]" },
      { name: "issuedOn", type: "uint64[]" },
      { name: "publishedOn", type: "uint64[]" },
    ],
  },
] as const;

function isValidE164(phoneNumber: string) {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
}

function parseTrustedIssuers(raw: string | undefined): `0x${string}`[] {
  if (!raw) return [];
  const parsed: `0x${string}`[] = [];
  for (const value of raw.split(",").map((v) => v.trim()).filter((v) => /^0x[a-fA-F0-9]{40}$/.test(v))) {
    try {
      // Normalize mixed-case env entries before checksum validation.
      parsed.push(getAddress(value.toLowerCase()) as `0x${string}`);
    } catch {
      // Ignore malformed issuer entries instead of failing the full request.
    }
  }
  return parsed;
}

function getNetworkConfig() {
  const network = (process.env.CELO_NETWORK || "mainnet").toLowerCase();
  // @celo/identity v5 supports MAINNET/ALFAJORES contexts.
  // We map celo sepolia to ALFAJORES ODIS context for compatibility while using sepolia RPC chain for reads.
  if (network === "sepolia") {
    return { chain: celoSepolia, context: OdisContextName.ALFAJORES };
  }
  if (network === "alfajores" || network === "testnet") {
    return { chain: celoAlfajores, context: OdisContextName.ALFAJORES };
  }
  return { chain: celo, context: OdisContextName.MAINNET };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const phoneNumber = body?.phoneNumber?.trim();

    if (!phoneNumber || !isValidE164(phoneNumber)) {
      return NextResponse.json({ error: "Invalid phone number format. Use E.164 (e.g. +2348012345678)." }, { status: 400 });
    }

    const issuerPk = process.env.CELO_LOOKUP_PRIVATE_KEY;
    const federatedAttestationsAddress = process.env.CELO_FEDERATED_ATTESTATIONS_ADDRESS as `0x${string}` | undefined;
    const trustedIssuers = parseTrustedIssuers(process.env.CELO_TRUSTED_ISSUERS);

    if (!issuerPk || !/^0x[a-fA-F0-9]{64}$/.test(issuerPk)) {
      return NextResponse.json({ error: "Server is missing CELO_LOOKUP_PRIVATE_KEY." }, { status: 500 });
    }
    if (!federatedAttestationsAddress || !/^0x[a-fA-F0-9]{40}$/.test(federatedAttestationsAddress)) {
      return NextResponse.json({ error: "Server is missing CELO_FEDERATED_ATTESTATIONS_ADDRESS." }, { status: 500 });
    }
    if (trustedIssuers.length === 0) {
      return NextResponse.json({ error: "Server is missing CELO_TRUSTED_ISSUERS for lookup-only mode." }, { status: 500 });
    }

    const { chain, context } = getNetworkConfig();

    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    const rpcUrl = process.env.CELO_RPC_URL || chain.rpcUrls.default.http[0];
    const kit = newKit(rpcUrl);
    kit.connection.addAccount(issuerPk);
    const localAccounts = kit.connection.getLocalAccounts();
    const issuerAddress = localAccounts[0];

    if (!issuerAddress) {
      return NextResponse.json({ error: "Unable to derive issuer address from CELO_LOOKUP_PRIVATE_KEY." }, { status: 500 });
    }

    const authSigner = {
      authenticationMethod: AuthenticationMethod.WALLET_KEY,
      contractKit: kit,
    } as any;

    const serviceContext = OdisUtils.Query.getServiceContext(context);

    const quotaStatus = await OdisUtils.Quota.getPnpQuotaStatus(
      issuerAddress,
      authSigner,
      serviceContext
    );

    if (quotaStatus.remainingQuota <= 0) {
      return NextResponse.json(
        {
          error:
            "ODIS lookup quota is exhausted for CELO_LOOKUP_PRIVATE_KEY. Top up quota and retry.",
        },
        { status: 402 }
      );
    }

    const { obfuscatedIdentifier } = await OdisUtils.Identifier.getObfuscatedIdentifier(
      phoneNumber,
      OdisUtils.Identifier.IdentifierPrefix.PHONE_NUMBER,
      issuerAddress,
      authSigner,
      serviceContext
    );

    const result = await publicClient.readContract({
      address: getAddress(federatedAttestationsAddress),
      abi: federatedAttestationsAbi,
      functionName: "lookupAttestations",
      args: [obfuscatedIdentifier as `0x${string}`, trustedIssuers],
    });

    const rawAccounts = Array.isArray(result)
      ? result[0]
      : (result as { accounts?: readonly `0x${string}`[] })?.accounts || [];

    const addresses = (rawAccounts as readonly `0x${string}`[])
      .map((addr) => getAddress(addr))
      .filter((addr) => addr !== "0x0000000000000000000000000000000000000000");

    return NextResponse.json({
      found: addresses.length > 0,
      addresses,
      primaryAddress: addresses[0] || null,
    });
  } catch (error) {
    console.error("Phone resolution failed:", error);
    if (
      error instanceof Error &&
      (error.message === "odisAuthError" || error.message.includes("odisAuthError"))
    ) {
      return NextResponse.json(
        {
          error:
            "ODIS authentication failed. Confirm CELO_LOOKUP_PRIVATE_KEY and ensure the account has ODIS quota.",
        },
        { status: 401 }
      );
    }
    if (
      error instanceof Error &&
      (error.message === "odisQuotaError" || error.message.includes("odisQuotaError"))
    ) {
      return NextResponse.json(
        {
          error:
            "ODIS lookup quota is exhausted for CELO_LOOKUP_PRIVATE_KEY. Top up quota and retry.",
        },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: "Failed to resolve phone number." }, { status: 500 });
  }
}
