import { ethers } from "hardhat";

async function main() {
  const GOODDOLLAR_ADDRESS = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";

  console.log("🔍 Investigating GoodDollar token...");

  // Check if contract exists
  const code = await ethers.provider.getCode(GOODDOLLAR_ADDRESS);
  console.log(`Contract exists: ${code !== "0x"}`);

  // Try to call basic ERC20 functions
  const erc20ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ];

  const token = await ethers.getContractAt(erc20ABI, GOODDOLLAR_ADDRESS);

  try {
    const name = await token.name();
    console.log(`Name: ${name}`);
  } catch (e: any) {
    console.log(`Name: Error - ${e.message}`);
  }

  try {
    const symbol = await token.symbol();
    console.log(`Symbol: ${symbol}`);
  } catch (e: any) {
    console.log(`Symbol: Error - ${e.message}`);
  }

  try {
    const decimals = await token.decimals();
    console.log(`Decimals: ${decimals}`);
  } catch (e: any) {
    console.log(`Decimals: Error - ${e.message}`);
  }

  try {
    const totalSupply = await token.totalSupply();
    console.log(`Total Supply: ${ethers.formatUnits(totalSupply, 18)}`);
  } catch (e: any) {
    console.log(`Total Supply: Error - ${e.message}`);
  }
}

main().catch(console.error);
