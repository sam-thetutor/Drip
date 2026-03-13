const { OdisUtils } = require('@celo/identity');
const { OdisContextName, AuthenticationMethod } = require('@celo/identity/lib/odis/query');
const { newKit } = require('@celo/contractkit');
const { createPublicClient, http, getAddress } = require('viem');
const { celo } = require('viem/chains');
const { privateKeyToAccount } = require('viem/accounts');

const attestationRegisteredEvent = {
  type: 'event',
  anonymous: false,
  name: 'AttestationRegistered',
  inputs: [
    { name: 'identifier', type: 'bytes32', indexed: true },
    { name: 'issuer', type: 'address', indexed: true },
    { name: 'account', type: 'address', indexed: true },
    { name: 'signer', type: 'address', indexed: false },
    { name: 'issuedOn', type: 'uint64', indexed: false },
    { name: 'publishedOn', type: 'uint64', indexed: false },
  ],
};

const attestationRevokedEvent = {
  type: 'event',
  anonymous: false,
  name: 'AttestationRevoked',
  inputs: [
    { name: 'identifier', type: 'bytes32', indexed: true },
    { name: 'issuer', type: 'address', indexed: true },
    { name: 'account', type: 'address', indexed: true },
    { name: 'signer', type: 'address', indexed: false },
    { name: 'issuedOn', type: 'uint64', indexed: false },
    { name: 'publishedOn', type: 'uint64', indexed: false },
  ],
};

async function main() {
  const phone = process.argv[2];
  const expectedAccountArg = process.argv[3];
  if (!phone) {
    throw new Error('Usage: node tmp-trace-phone.js +256... [expectedAccount]');
  }

  const expectedAccount = expectedAccountArg ? getAddress(expectedAccountArg) : null;

  const pk = process.env.CELO_LOOKUP_PRIVATE_KEY;
  if (!pk) {
    throw new Error('Missing CELO_LOOKUP_PRIVATE_KEY');
  }

  const rpc = process.env.CELO_RPC_URL || 'https://forno.celo.org';
  const faAddress = getAddress(
    process.env.CELO_FEDERATED_ATTESTATIONS_ADDRESS || '0x0aD5b1d0C25ecF6266Dd951403723B2687d6aff2'
  );

  const kit = newKit(rpc);
  kit.connection.addAccount(pk);
  const lookupAccount = privateKeyToAccount(pk).address;

  const authSigner = {
    authenticationMethod: AuthenticationMethod.WALLET_KEY,
    contractKit: kit,
  };

  const serviceContext = OdisUtils.Query.getServiceContext(OdisContextName.MAINNET);
  const { obfuscatedIdentifier } = await OdisUtils.Identifier.getObfuscatedIdentifier(
    phone,
    OdisUtils.Identifier.IdentifierPrefix.PHONE_NUMBER,
    lookupAccount,
    authSigner,
    serviceContext
  );

  const client = createPublicClient({ chain: celo, transport: http(rpc) });

  const regArgs = expectedAccount
    ? { identifier: obfuscatedIdentifier, account: expectedAccount }
    : { identifier: obfuscatedIdentifier };

  const parseBigIntEnv = (name, fallback) => {
    const raw = process.env[name];
    if (!raw) return fallback;
    try {
      return BigInt(raw);
    } catch {
      return fallback;
    }
  };

  const initialChunkSize = parseBigIntEnv('TRACE_CHUNK_SIZE', 5_000n);
  const maxBlocksBack = parseBigIntEnv('TRACE_MAX_BLOCKS_BACK', 100_000n);

  async function scanInChunks(event, args) {
    const latest = await client.getBlockNumber();
    let chunkSize = initialChunkSize;
    const minBlock = latest > maxBlocksBack ? latest - maxBlocksBack : 0n;
    let toBlock = latest;
    const out = [];
    let chunks = 0;

    while (toBlock >= 0n) {
      const fromBlock = toBlock >= chunkSize ? toBlock - chunkSize + 1n : minBlock;

      try {
        const logs = await client.getLogs({
          address: faAddress,
          event,
          args,
          fromBlock,
          toBlock,
          strict: false,
        });
        out.push(...logs);
      } catch (err) {
        // Back off dynamically when providers reject large ranges.
        if (chunkSize > 100n) {
          chunkSize = chunkSize / 2n;
          continue;
        }
        throw err;
      }

      chunks += 1;
      if (chunks % 20 === 0) {
        console.error(
          `[trace] ${event.name}: chunks=${chunks} scannedDownTo=${fromBlock.toString()} logs=${out.length}`
        );
      }

      if (fromBlock <= minBlock) break;
      toBlock = fromBlock - 1n;
    }

    return out;
  }

  const registeredAll = await scanInChunks(attestationRegisteredEvent, regArgs);
  const revokedAll = await scanInChunks(attestationRevokedEvent, regArgs);

  const normalize = (value) => (typeof value === 'string' ? value.toLowerCase() : String(value));
  const targetIdentifier = normalize(obfuscatedIdentifier);

  const registered = registeredAll.filter((log) => normalize(log.args.identifier) === targetIdentifier);
  const revoked = revokedAll.filter((log) => normalize(log.args.identifier) === targetIdentifier);

  const active = new Map();
  for (const log of registered) {
    const key = `${log.args.issuer?.toLowerCase()}|${log.args.account?.toLowerCase()}`;
    active.set(key, {
      issuer: log.args.issuer,
      account: log.args.account,
      signer: log.args.signer,
      issuedOn: log.args.issuedOn?.toString?.() ?? null,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber?.toString?.() ?? null,
    });
  }
  for (const log of revoked) {
    const key = `${log.args.issuer?.toLowerCase()}|${log.args.account?.toLowerCase()}`;
    active.delete(key);
  }

  const activeList = Array.from(active.values());

  console.log(
    JSON.stringify(
      {
        phone,
        obfuscatedIdentifier,
        federatedAttestationsAddress: faAddress,
        lookupAccount,
        expectedAccount,
        totals: {
          latestBlock: latest.toString(),
          minScannedBlock: minBlock.toString(),
          chunkSizeInitial: initialChunkSize.toString(),
          registeredEventsScanned: registeredAll.length,
          revokedEventsScanned: revokedAll.length,
          registeredEventsForIdentifier: registered.length,
          revokedEventsForIdentifier: revoked.length,
          activeMappings: activeList.length,
        },
        activeMappings: activeList,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
