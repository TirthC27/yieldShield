/**
 * Copies compiled ABIs from Hardhat artifacts to frontend/src/abis/
 * Run after every `npx hardhat compile` or via `npm run copy-abis`
 */
const fs = require("fs");
const path = require("path");

const CONTRACTS = [
  { name: "MockERC20", path: "contracts/MockERC20.sol/MockERC20.json" },
  { name: "ConfidentialYST", path: "contracts/ConfidentialYST.sol/ConfidentialYST.json" },
  { name: "YieldShieldVault", path: "contracts/YieldShieldVault.sol/YieldShieldVault.json" },
  { name: "PositionManager", path: "contracts/PositionManager.sol/PositionManager.json" },
  { name: "GuardianNFT", path: "contracts/GuardianNFT.sol/GuardianNFT.json" },
  { name: "BadgeNFT", path: "contracts/BadgeNFT.sol/BadgeNFT.json" },
];

const artifactsDir = path.join(__dirname, "..", "artifacts");
const outDir = path.join(__dirname, "..", "frontend", "src", "abis");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

let copied = 0;
for (const c of CONTRACTS) {
  const srcPath = path.join(artifactsDir, c.path);
  if (!fs.existsSync(srcPath)) {
    console.error(`❌ Missing: ${srcPath}`);
    continue;
  }
  const artifact = JSON.parse(fs.readFileSync(srcPath, "utf-8"));
  const abiOnly = JSON.stringify(artifact.abi, null, 2);
  const outFile = path.join(outDir, `${c.name}.json`);
  fs.writeFileSync(outFile, abiOnly);
  console.log(`✅ ${c.name} → ${outFile} (${artifact.abi.length} entries)`);
  copied++;
}

console.log(`\nCopied ${copied}/${CONTRACTS.length} ABIs to frontend/src/abis/`);
