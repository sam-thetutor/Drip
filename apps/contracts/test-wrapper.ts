import { ethers } from "hardhat";

async function main() {
  const SUPERTOKEN_FACTORY = "0x36be86dEe6BC726Ed0Cbd170ccD2F21760BC73D9";
  const GOODDOLLAR_ADDRESS = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";

  const factoryABI = [
    "function createERC20Wrapper(address underlyingToken, uint8 underlyingDecimals, string memory name, string memory symbol) external returns (address superToken)",
    "function getERC20Wrapper(address underlyingToken) external view returns (address)",
  ];

  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractAt(factoryABI, SUPERTOKEN_FACTORY);
  
  // Check existing wrapper
  try {
    const existing = await factory.getERC20Wrapper(GOODDOLLAR_ADDRESS);
    if (existing && existing !== ethers.ZeroAddress) {
      console.log("✅ Wrapper already exists:", existing);
      return;
    }
  } catch (e: any) {
    console.log("getERC20Wrapper not found or error");
  }

  // Try to create wrapper
  try {
    console.log("Attempting to wrap GoodDollar...");
    console.log(`Account: ${deployer.address}`);
    
    const tx = await factory.createERC20Wrapper(
      GOODDOLLAR_ADDRESS,
      18,
      "Super GoodDollar",
      "GDx"
    );
    
    console.log("Transaction sent:", tx.hash);
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed!");
  } catch (e: any) {
    console.log("❌ Error:", e.message);
    if (e.data) console.log("Data:", e.data);
  }
}

main().catch(console.error);
