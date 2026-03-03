import { ethers } from "hardhat";

async function main() {
  const account = "0x7818CEd1298849B47a9B56066b5adc72CDDAf733";
  const balance = await ethers.provider.getBalance(account);
  console.log(`CELO balance: ${ethers.formatEther(balance)} CELO`);
}

main().catch(console.error);
