/**
 * Emergency: mint extra tokens to the vault to cover the shortfall,
 * then execute the stuck withdrawal.
 *
 * Run: npx hardhat run scripts/fixWithdraw.ts --network arbitrumSepolia
 */
import { ethers } from "hardhat";

async function main() {
  const VAULT_ADDR = "0xB6aB4EdF9a0007d7E893FEb58307d84CCa2F60A0";
  const YST_ADDR = "0x65C6Ccbf5754eFf2A5b0fFD300B1d45a94d2BE23";
  const [signer] = await ethers.getSigners();
  
  console.log("Signer:", await signer.getAddress());

  const token = await ethers.getContractAt("MockERC20", YST_ADDR);
  const vault = await ethers.getContractAt("YieldShieldVault", VAULT_ADDR);

  // Check current state
  const vaultBal = await token.balanceOf(VAULT_ADDR);
  const wdReq = await vault.withdrawRequests(await signer.getAddress());
  
  console.log("Vault balance:", ethers.formatEther(vaultBal), "YST");
  console.log("Requested amount:", ethers.formatEther(wdReq.amount), "YST");
  
  if (wdReq.amount === 0n) {
    console.log("No pending withdrawal request.");
    return;
  }

  const shortfall = wdReq.amount - vaultBal;
  
  if (shortfall > 0n) {
    console.log(`\nShortfall: ${ethers.formatEther(shortfall)} YST`);
    console.log("Minting extra tokens to vault to cover the gap...");
    
    // Mint extra tokens directly to the vault
    const mintAmount = shortfall + ethers.parseEther("100"); // extra buffer for future yield
    const tx = await token.mint(VAULT_ADDR, mintAmount);
    await tx.wait();
    console.log(`✅ Minted ${ethers.formatEther(mintAmount)} YST to vault`);
    
    const newBal = await token.balanceOf(VAULT_ADDR);
    console.log("New vault balance:", ethers.formatEther(newBal), "YST");
  } else {
    console.log("✅ Vault has enough tokens");
  }
  
  // Now execute the withdrawal
  console.log("\nExecuting withdrawal...");
  try {
    const tx = await vault.executeWithdraw();
    const receipt = await tx.wait();
    console.log("✅ Withdrawal executed! TX:", receipt?.hash);
  } catch (err: any) {
    console.log("❌ Execute failed:", err.reason || err.message);
  }
}

main().catch(console.error);
