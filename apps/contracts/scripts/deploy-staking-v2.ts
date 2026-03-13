import { ethers, upgrades, network } from "hardhat";

// G$ token on Celo Mainnet
const G_DOLLAR_CELO = "0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying DripStakingV2 with account:", deployer.address);
  console.log("Network:", network.name, `(chainId: ${(await ethers.provider.getNetwork()).chainId})`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "CELO\n");

  const tokenAddress = process.env.STAKING_TOKEN || G_DOLLAR_CELO;
  console.log("Staking token (G$):", tokenAddress);

  // Deploy as UUPS proxy
  const Factory = await ethers.getContractFactory("DripStakingV2");
  console.log("Deploying UUPS proxy...");

  const proxy = await upgrades.deployProxy(Factory, [tokenAddress], {
    kind: "uups",
    initializer: "initialize",
  });

  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();

  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("\n✅ DripStakingV2 deployed!");
  console.log("   Proxy address (use this):  ", proxyAddress);
  console.log("   Implementation address:    ", implAddress);
  console.log("   Deployer / Owner:          ", deployer.address);
  console.log("   Token (G$):                ", tokenAddress);

  // Quick sanity check
  const contract = Factory.attach(proxyAddress) as any;
  const owner = await contract.owner();
  const storedToken = await contract.token();
  console.log("\nSanity checks:");
  console.log("   owner():", owner);
  console.log("   token():", storedToken);

  console.log("\n--- Copy this line into apps/web/src/lib/contracts/config.ts ---");
  console.log(`DripStakingV2: "${proxyAddress}",`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
