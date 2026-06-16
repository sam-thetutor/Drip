/**
 * debugVaults.ts — check balances and code at vault addresses
 */
import { ethers } from "hardhat";

const G_DOLLAR = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";
const DEPLOYER  = "0x16f3dF71818C63d455E75962cC86c1Ae15CB8bb8";
const DRIP_V4   = "0x82002e08889bA6d80f74b693A7a1d51eaD171AB2";

// vault addresses from the test runs
const VAULTS = [
  { id: 1, addr: "0xeb2e1470FBD9dd9274A95eb459C9b8F01e9c2F81" },
  { id: 2, addr: "0x8a78aFf237443Aa11cD281f5a92dcb4D8BC24F57" },
  { id: 3, addr: "0x3f1e03641d6995Ed090259Fb756B05731fF54e93" },
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const DRIP_V4_ABI = [
  "function getStream(uint256 streamId) external view returns (tuple(uint256 streamId, address sender, address recipient, address token, int96 flowRate, uint256 totalAmount, uint256 depositAmount, address vault, uint256 startTime, uint256 endTime, uint256 finishTime, uint8 status, string title))",
  "function streamCount() external view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const gDollar  = new ethers.Contract(G_DOLLAR, ERC20_ABI, signer);
  const dripV4   = new ethers.Contract(DRIP_V4, DRIP_V4_ABI, signer);

  const decimals = Number(await gDollar.decimals());
  const fmt = (n: bigint) => {
    const d = 10n ** BigInt(decimals);
    return `${n / d}.${(n % d).toString().padStart(decimals, "0").slice(0, 6)} G$`;
  };

  console.log("─".repeat(60));
  const deployerBal = await gDollar.balanceOf(DEPLOYER);
  console.log("Deployer balance :", fmt(deployerBal));
  console.log("Stream count     :", (await dripV4.streamCount()).toString());

  for (const v of VAULTS) {
    console.log("\n─".repeat(60));
    const code = await ethers.provider.getCode(v.addr);
    const bal  = await gDollar.balanceOf(v.addr);
    console.log(`Vault ${v.id} (${v.addr})`);
    console.log(`  code length : ${code.length} chars`);
    console.log(`  has code    : ${code.length > 2 ? "yes" : "NO CODE"}`);
    console.log(`  G$ balance  : ${fmt(bal)} (${bal.toString()} wei)`);
    try {
      const s = await dripV4.getStream(v.id);
      console.log(`  stream status : ${s.status.toString()} (0=Created,1=Active,2=Completed,3=Cancelled)`);
      console.log(`  stream vault  : ${s.vault}`);
      console.log(`  addresses match: ${s.vault.toLowerCase() === v.addr.toLowerCase() ? "yes" : "MISMATCH!"}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`  stream read error: ${msg}`);
    }
  }
  console.log("\n─".repeat(60));
}

main().catch(console.error);
