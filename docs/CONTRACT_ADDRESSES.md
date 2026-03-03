# Contract Addresses Reference

## Drip Contracts (Celo Mainnet)

### DripCore Proxy
**Address:** `0x5530975fDe062FE6706298fF3945E3d1a17A310a`
- **Network:** Celo Mainnet (Chain ID: 42220)
- **Type:** TransparentUpgradeableProxy
- **Explorer:** https://celoscan.io/address/0x5530975fDe062FE6706298fF3945E3d1a17A310a

### DripCore Implementation
**Address:** `0x081cB570E86bc3aA09FE5d848c2d91368fcEf0dE`
- **Network:** Celo Mainnet (Chain ID: 42220)
- **Type:** Implementation Contract
- **Explorer:** https://celoscan.io/address/0x081cB570E86bc3aA09FE5d848c2d91368fcEf0dE

### Proxy Admin
**Address:** `0x90FD81efC0bB74cca2997ebB6D77e5145788f481`
- **Network:** Celo Mainnet (Chain ID: 42220)

### SubscriptionManager
**Address:** `0xBE3e232657233224F14b7b2a5625f69aF8F95054`
- **Network:** Celo Mainnet (Chain ID: 42220)
- **Explorer:** https://celoscan.io/address/0xBE3e232657233224F14b7b2a5625f69aF8F95054

---

## Good Dollar Engagement Rewards Contracts

### Development Contract (DEV)
**Address:** `0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465`
- **Network:** Celo Mainnet (Chain ID: 42220)
- **Environment:** Development
- **Explorer:** https://celoscan.io/address/0xb44fC3A592aDaA257AECe1Ae8956019EA53d0465
- **Note:** Currently using this for testing (allows anyone to approve apps)
- **Dev Portal:** https://engagement-rewards-dev.vercel.app

### Production Contract
**Address:** `0x25db74CF4E7BA120526fd87e159CF656d94bAE43`
- **Network:** Celo Mainnet (Chain ID: 42220)
- **Environment:** Production
- **Explorer:** https://celoscan.io/address/0x25db74CF4E7BA120526fd87e159CF656d94bAE43
- **Note:** Requires approval from Good Labs

---

## Good Dollar Identity Contract

The Identity contract address is managed by the `@goodsdks/citizen-sdk` and varies by environment:
- **Production:** Managed by SDK (Celo Mainnet)
- **Staging:** Managed by SDK (Celo Sepolia)
- **Development:** Managed by SDK

To check Identity contract address, use the Identity SDK:
```typescript
import { IdentitySDK } from "@goodsdks/citizen-sdk";
const identitySDK = await IdentitySDK.init({
  publicClient,
  walletClient,
  env: "production", // or "staging" or "development"
});
```

---

## Good Dollar UBI Contracts

Good Dollar UBI contracts are also managed by the SDKs and vary by environment:
- **Production:** For Celo Mainnet
- **Staging:** For Celo Sepolia testnet
- **Development:** For development/testing

---

## Other Networks

### Celo Sepolia Testnet
- **DripCore Proxy:** `0xfAaB5005f7844eC5499cF258F52dE29EDc74aa31`
- **DripCore Implementation:** `0xe4789E09696De271E9192e88883722C38326D741`
- **SubscriptionManager:** `0xb8eCfcC00e1d63525b81cF2bC17125f56952D384`

### Lisk Mainnet
- **DripCore Proxy:** `0x87BcC4Ef6817d3137568Be91f019bC4e35d9A4b6`
- **DripCore Implementation:** `0x50203ba83FB9Ce709Dd7Ddd4D335aEcdF532F31a`
- **SubscriptionManager:** `0x009AB24eC563d05cfD3345E6128cBaFAb8b62299`

---

## Configuration Files

- **Frontend Config:** `apps/web/src/lib/contracts/config.ts`
- **Scripts Config:** `apps/contracts/scripts/utils/engagement-signature.ts`
- **Deployment Records:** `apps/contracts/ignition/deployments/chain-42220/`
