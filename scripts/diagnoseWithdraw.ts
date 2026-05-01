/**
 * Diagnostic script: checks executeWithdraw state on-chain
 * Run: npx hardhat run scripts/diagnoseWithdraw.ts --network arbitrumSepolia
 */
import { ethers } from "hardhat";

async function main() {
  const VAULT_ADDR = "0xB6aB4EdF9a0007d7E893FEb58307d84CCa2F60A0";
  const USER_ADDR = "0x727f6afcab680aa8bb34819cac09c95ac73b9762"; // from wallet screenshot

  const vault = await ethers.getContractAt("YieldShieldVault", VAULT_ADDR);

  console.log("=== VAULT DIAGNOSTICS ===\n");

  // 1. Current block
  const block = await ethers.provider.getBlockNumber();
  console.log("Current block:", block);

  // 2. User principal
  const principal = await vault.principal(USER_ADDR);
  console.log("Principal:", ethers.formatEther(principal), "YST");

  // 3. Withdraw request
  const wdReq = await vault.withdrawRequests(USER_ADDR);
  console.log("\nWithdraw request:");
  console.log("  Amount:", ethers.formatEther(wdReq.amount), "YST");
  console.log("  Request block:", wdReq.requestBlock.toString());
  console.log("  Ready at block:", (wdReq.requestBlock + 2n).toString());
  console.log("  Current block:", block);

  if (wdReq.amount === 0n) {
    console.log("\n❌ PROBLEM: No pending withdrawal request!");
    console.log("   The user needs to call requestWithdraw(amount) first.");
    console.log("   This is why executeWithdraw() reverts: 'Vault: no pending request'");
    return;
  }

  const blocksRemaining = Number(wdReq.requestBlock + 2n) - block;
  if (blocksRemaining > 0) {
    console.log(`\n❌ PROBLEM: Need to wait ${blocksRemaining} more blocks!`);
    console.log("   This is why executeWithdraw() reverts: 'Vault: too early'");
    return;
  }

  console.log("\n✅ Withdrawal should be executable (blocks passed)");

  // 4. Test static call
  console.log("\nTesting static call to executeWithdraw...");
  try {
    const [signer] = await ethers.getSigners();
    console.log("Signer address:", await signer.getAddress());
    
    // If signer is the user, try static call
    if ((await signer.getAddress()).toLowerCase() === USER_ADDR.toLowerCase()) {
      await vault.executeWithdraw.staticCall();
      console.log("✅ Static call succeeded — executeWithdraw will work");
    } else {
      console.log("⚠️  Signer is not the user — cannot test static call");
      console.log("   Signer:", await signer.getAddress());
      console.log("   User:  ", USER_ADDR);
    }
  } catch (err: any) {
    console.log("❌ Static call REVERTED:", err.reason || err.message);
  }

  // 5. Check vault token balance
  const tokenAddr = await vault.token();
  const token = await ethers.getContractAt("MockERC20", tokenAddr);
  const vaultBal = await token.balanceOf(VAULT_ADDR);
  console.log("\nVault token balance:", ethers.formatEther(vaultBal), "YST");
  console.log("Requested withdrawal:", ethers.formatEther(wdReq.amount), "YST");
  
  if (vaultBal < wdReq.amount) {
    console.log("❌ PROBLEM: Vault doesn't have enough tokens to pay out!");
  }
}

main().catch(console.error);
