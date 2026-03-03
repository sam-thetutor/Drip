import { ethers } from "hardhat";

async function main() {
  // Try to find if there's already a wrapped Super Token for GoodDollar
  const SUPERTOKEN_FACTORY = "0x36be86dEe6BC726Ed0Cbd170ccD2F21760BC73D9";
  const GOODDOLLAR_ADDRESS = "0x765De816845861E75A25fCa122BB6BEB168E28B1";

  const factoryABI = [
    "function getCanonicalERC20Wrapper(address underlyingToken) external view returns (address)",
  ];

  const factory = await ethers.getContractAt(factoryABI, SUPERTOKEN_FACTORY);
  
  try {
    const wrapper = await factory.getCanonicalERC20Wrapper(GOODDOLLAR_ADDRESS);
    console.log("✅ Found existing Super Token wrapper:", wrapper);
    if (wrapper !== ethers.ZeroAddress) {
      console.log("Using this address for deployment!");
    }
  } catch (e: any) {
    console.log("No canonical wrapper found:", e.message);
  }
}

main().catch(console.error);
