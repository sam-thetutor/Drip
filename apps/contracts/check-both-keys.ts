import { ethers } from "hardhat";

async function main() {
  const pk1 = "de02aea8dabb0cb2a0830ffb299f82fcdd8cf14d08563f2dfeaf378110a10f61";
  const pk2 = "d0e9117cf353f4895f7a0280b5dab7fd88c19202c43e03be8aefca0c89f7c9d5";

  const wallet1 = new ethers.Wallet(pk1);
  const wallet2 = new ethers.Wallet(pk2);

  const balance1 = await ethers.provider.getBalance(wallet1.address);
  const balance2 = await ethers.provider.getBalance(wallet2.address);

  console.log("Key 1 Account:", wallet1.address);
  console.log("  CELO balance:", ethers.formatEther(balance1));

  console.log("\nKey 2 Account:", wallet2.address);
  console.log("  CELO balance:", ethers.formatEther(balance2));

  const better = Number(ethers.formatEther(balance1)) > Number(ethers.formatEther(balance2)) ? "Key 1" : "Key 2";
  console.log("\n✅ Better funded account:", better);
}

main().catch(console.error);
