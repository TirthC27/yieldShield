import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  YOLDR — YieldShield Deployment (Nox Integrated)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`Deployer: ${deployer.address}`);
  console.log("");

  // 1. Deploy Mock ERC-20 — "YieldShield Token" (YST)
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const yst = await MockERC20.deploy("YieldShield Token", "YST");
  await yst.waitForDeployment();
  const ystAddress = await yst.getAddress();
  console.log(`✅ YieldShield Token (YST):     ${ystAddress}`);

  // 2. Deploy ConfidentialYST — ERC-7984 wrapper for YST
  const ConfidentialYST = await ethers.getContractFactory("ConfidentialYST");
  const cYST = await ConfidentialYST.deploy(ystAddress);
  await cYST.waitForDeployment();
  const cYSTAddress = await cYST.getAddress();
  console.log(`✅ ConfidentialYST (cYST):       ${cYSTAddress}`);

  // 3. Deploy YieldShieldVault (takes underlying + confidential token)
  const Vault = await ethers.getContractFactory("YieldShieldVault");
  const vault = await Vault.deploy(ystAddress, cYSTAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`✅ YieldShieldVault:             ${vaultAddress}`);

  // 4. Deploy PositionManager
  const PM = await ethers.getContractFactory("PositionManager");
  const pm = await PM.deploy(vaultAddress);
  await pm.waitForDeployment();
  const pmAddress = await pm.getAddress();
  console.log(`✅ PositionManager:              ${pmAddress}`);

  // 5. Deploy GuardianNFT
  const Guardian = await ethers.getContractFactory("GuardianNFT");
  const guardian = await Guardian.deploy(vaultAddress);
  await guardian.waitForDeployment();
  const guardianAddress = await guardian.getAddress();
  console.log(`✅ GuardianNFT:                  ${guardianAddress}`);

  // 6. Deploy BadgeNFT
  const Badge = await ethers.getContractFactory("BadgeNFT");
  const badge = await Badge.deploy(pmAddress);
  await badge.waitForDeployment();
  const badgeAddress = await badge.getAddress();
  console.log(`✅ BadgeNFT:                     ${badgeAddress}`);

  // 7. Link contracts
  console.log("\n🔗 Linking contracts...");
  let tx = await vault.setPositionManager(pmAddress);
  await tx.wait();
  console.log("   Vault → PositionManager ✓");

  tx = await vault.setGuardianNFT(guardianAddress);
  await tx.wait();
  console.log("   Vault → GuardianNFT     ✓");

  tx = await pm.setBadgeNFT(badgeAddress);
  await tx.wait();
  console.log("   PositionManager → Badge ✓");

  // 8. Save deployment addresses
  const deployment = {
    network: "arbitrum-sepolia",
    chainId: 421614,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    noxIntegration: true,
    contracts: {
      YieldShieldToken: ystAddress,
      ConfidentialYST: cYSTAddress,
      YieldShieldVault: vaultAddress,
      PositionManager: pmAddress,
      GuardianNFT: guardianAddress,
      BadgeNFT: badgeAddress,
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "arbitrum-sepolia.json");
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2));
  console.log(`\n💾 Deployment saved to ${outFile}`);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Deployment complete 🚀 (with iExec Nox)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
