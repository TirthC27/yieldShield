import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Minting test tokens for: ${deployer.address}`);

  // Read deployment file to get YST address
  const fs = await import("fs");
  const path = await import("path");
  const deploymentPath = path.join(__dirname, "..", "deployments", "arbitrum-sepolia.json");

  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ Deployment file not found. Run deploy.ts first.");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const ystAddress = deployment.contracts.YieldShieldToken;

  const yst = await ethers.getContractAt("MockERC20", ystAddress);

  const amount = ethers.parseEther("10000");
  const tx = await yst.mint(deployer.address, amount);
  await tx.wait();

  const balance = await yst.balanceOf(deployer.address);
  console.log(`✅ Minted 10,000 YST`);
  console.log(`   Balance: ${ethers.formatEther(balance)} YST`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
