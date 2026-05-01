import MockERC20ABI from "../abis/MockERC20.json";
import YieldShieldVaultABI from "../abis/YieldShieldVault.json";
import PositionManagerABI from "../abis/PositionManager.json";
import GuardianNFTABI from "../abis/GuardianNFT.json";
import BadgeNFTABI from "../abis/BadgeNFT.json";

// ---------------------------------------------------------------------------
//  Contract Addresses (Arbitrum Sepolia deployment)
//
//  NOTE: After redeploying with Nox integration, update these addresses
//  from deployments/arbitrum-sepolia.json
// ---------------------------------------------------------------------------

export const ADDRESSES = {
  YST: "0xcA7c26779B4eEF9107515fFd04a58d35b9f01707" as `0x${string}`,
  ConfidentialYST: "0xA13d3FF0E78C98fa552aFC017Ef5d9A5d5b50487" as `0x${string}`,
  Vault: "0x871d271FeaDC34fBd91fB176C21Cf15722f824CF" as `0x${string}`,
  PositionManager: "0xDD0508567d99258b51Ab41d1781984F6868836a5" as `0x${string}`,
  GuardianNFT: "0x0FCe266EE0D8eBd96aea9b320d548B739A25ac72" as `0x${string}`,
  BadgeNFT: "0x1b312168795710c4fA1A4F0226F8bCD037aFEa20" as `0x${string}`,
} as const;

// ---------------------------------------------------------------------------
//  ABIs — imported from compiled Hardhat artifacts (auto-copied via scripts/copyAbis.js)
// ---------------------------------------------------------------------------

export const ERC20_ABI = MockERC20ABI;
export const VAULT_ABI = YieldShieldVaultABI;
export const POSITION_MANAGER_ABI = PositionManagerABI;
export const GUARDIAN_ABI = GuardianNFTABI;
export const BADGE_ABI = BadgeNFTABI;

// ---------------------------------------------------------------------------
//  ERC-7984 Confidential Token ABI (subset for wrap/unwrap)
// ---------------------------------------------------------------------------

export const CONFIDENTIAL_TOKEN_ABI = [
  {
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    name: "wrap",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "spender", type: "address" }, { name: "until", type: "uint48" }],
    name: "setOperator",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }],
    name: "isOperator",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "underlying",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ---------------------------------------------------------------------------
//  Startup validation — logs warnings if addresses look wrong
// ---------------------------------------------------------------------------

export function validateContracts(): void {
  const checks: [string, string][] = [
    ["YST", ADDRESSES.YST],
    ["ConfidentialYST", ADDRESSES.ConfidentialYST],
    ["Vault", ADDRESSES.Vault],
    ["PositionManager", ADDRESSES.PositionManager],
    ["GuardianNFT", ADDRESSES.GuardianNFT],
    ["BadgeNFT", ADDRESSES.BadgeNFT],
  ];

  let ok = true;
  for (const [name, addr] of checks) {
    if (!addr || addr === "0x" || addr.length !== 42) {
      console.error(`❌ [YieldShield] Missing or invalid address for ${name}: ${addr}`);
      ok = false;
    }
  }

  // Verify ABIs have entries
  const abis: [string, unknown[]][] = [
    ["ERC20_ABI", ERC20_ABI as unknown[]],
    ["VAULT_ABI", VAULT_ABI as unknown[]],
    ["POSITION_MANAGER_ABI", POSITION_MANAGER_ABI as unknown[]],
    ["GUARDIAN_ABI", GUARDIAN_ABI as unknown[]],
    ["BADGE_ABI", BADGE_ABI as unknown[]],
  ];

  for (const [name, abi] of abis) {
    if (!abi || !Array.isArray(abi) || abi.length === 0) {
      console.error(`❌ [YieldShield] ABI is empty or missing: ${name}`);
      ok = false;
    } else {
      console.log(`✅ [YieldShield] ${name}: ${abi.length} ABI entries loaded`);
    }
  }

  if (ok) {
    console.log("✅ [YieldShield] All contract addresses and ABIs validated");
  }
}
