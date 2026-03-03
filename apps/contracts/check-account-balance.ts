import { ethers } from "hardhat";

async function main() {
  const account = "0x7818CEd1298849B47a9B56066b5adc72CDDAf733";
  const balance = await ethers.provider.getBalance(account);
  console.log(`Account: ${account}`);
  console.log(`CELO balance: ${ethers.formatEther(balance)} CELO`);
  
  if (Number(ethers.formatEther(balance)) < 0.5) {
    console.log("\n⚠️  Account has insufficient CELO for deployment!");
  } else {
    console.log("\n✅ Account has sufficient CELO for deployment!");
  }
}

main().catch(console.error);
