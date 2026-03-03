import { ethers } from "hardhat";

async function main() {
  const pk1 = "de02aea8dabb0cb2a0830ffb299f82fcdd8cf14d08563f2dfeaf378110a10f61";
  const pk2 = "d0e9117cf353f4895f7a0280b5dab7fd88c19202c43e03be8aefca0c89f7c9d5";

  const wallet1 = new ethers.Wallet(pk1);
  const wallet2 = new ethers.Wallet(pk2);

  const balance1 = await ethers.provider.getBalance(wallet1.address);
  const balance2 = await ethers.provider.getBalance(wallet2.address);

  const b1 = Number(ethers.formatEther(balance1));
  const b2 = Number(ethers.formatEther(balance2));

  console.log("📊 DEPLOYMENT STATUS\n");
  console.log("Account 1:", wallet1.address);
  console.log("  Balance:", b1, "CELO");
  console.log("  Status:", b1 > 0.5 ? "✅ Sufficient" : "❌ Insufficient");

  console.log("\nAccount 2:", wallet2.address);
  console.log("  Balance:", b2, "CELO");
  console.log("  Status:", b2 > 0.5 ? "✅ Sufficient" : "❌ Insufficient");

  console.log("\n⚠️  DEPLOYMENT REQUIRES:");
  console.log("  • Deploying DripStaking: ~0.14-0.2 CELO");
  console.log("  • Gas buffer: +0.3 CELO recommended");
  console.log("  • Total needed: ~0.5 CELO minimum");

  if (b1 < 0.5 && b2 < 0.5) {
    console.log("\n❌ Both accounts are underfunded!");
    console.log("\n💡 SOLUTION: Fund one of these addresses with CELO");
    console.log("   Send ~1 CELO to either account");
  }
}

main().catch(console.error);
