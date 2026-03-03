import { ethers } from "hardhat";

async function main() {
  const SUPERTOKEN_FACTORY = "0x36be86dEe6BC726Ed0Cbd170ccD2F21760BC73D9";
  const GOODDOLLAR_ADDRESS = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";

  console.log("🔍 Searching for wrapped Super Token for GoodDollar...\n");

  const factoryABI = [
    "function getERC20Wrapper(address underlyingToken) external view returns (address)",
    "function getSuperTokenForERC20(address erc20) external view returns (address)",
  ];

  const factory = await ethers.getContractAt(factoryABI, SUPERTOKEN_FACTORY);

  // Try to get wrapper
  try {
    const wrapper = await factory.getERC20Wrapper(GOODDOLLAR_ADDRESS);
    console.log("✅ Found ERC20Wrapper:", wrapper);
    if (wrapper !== ethers.ZeroAddress) {
      console.log("✨ This is the wrapper you should use!");
    }
  } catch (e: any) {
    console.log("❌ getERC20Wrapper failed:", e.message);
  }

  // Try getSuperTokenForERC20
  try {
    const superToken = await factory.getSuperTokenForERC20(GOODDOLLAR_ADDRESS);
    console.log("\n✅ Found Super Token:", superToken);
    if (superToken !== ethers.ZeroAddress) {
      console.log("✨ This is the super token you should use!");
    }
  } catch (e: any) {
    console.log("❌ getSuperTokenForERC20 failed:", e.message);
  }

  // If GoodDollar might already be a super token, check directly
  console.log("\n🔍 Checking if GoodDollar is already a Super Token...");
  const superTokenABI = [
    "function decimals() view returns (uint8)",
    "function underlying() view returns (address)",
    "function getUnderlyingToken() view returns (address)",
  ];

  try {
    const gdToken = await ethers.getContractAt(superTokenABI, GOODDOLLAR_ADDRESS);
    try {
      const underlying = await gdToken.getUnderlyingToken();
      console.log("✅ GoodDollar HAS an underlying token:", underlying);
      console.log("   → GoodDollar might already be a Super Token wrapper!");
    } catch (e) {
      console.log("No getUnderlyingToken method");
    }
  } catch (e: any) {
    console.log("Error checking:", e.message);
  }
}

main().catch(console.error);
