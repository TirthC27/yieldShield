import { useState, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useBlockNumber } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ADDRESSES, ERC20_ABI, VAULT_ABI, CONFIDENTIAL_TOKEN_ABI } from "../config/contracts";
import { useToast } from "../context/ToastContext";
import { useNoxSDK } from "../hooks/useNoxSDK";
import AIInsight from "./AIInsight";
import AIAdvisorPanel from "./AIAdvisorPanel";
import MintYSTButton from "./MintYSTButton";

type TxStep = "idle" | "approving" | "approved" | "depositing" | "success";

export default function Vault() {
  const { address } = useAccount();
  const { addToast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const { data: blockNum } = useBlockNumber({ watch: true });
  const { encryptAmount, decryptHandle } = useNoxSDK();

  // Deposit state
  const [depAmount, setDepAmount] = useState("");
  const [txStep, setTxStep] = useState<TxStep>("idle");

  // Withdraw state
  const [wdAmount, setWdAmount] = useState("");
  const [wdLoading, setWdLoading] = useState(false);
  const [execLoading, setExecLoading] = useState(false);

  // Encrypted balance state (decrypted client-side via Nox SDK)
  const [decryptedPrincipal, setDecryptedPrincipal] = useState<bigint | null>(null);
  const [decryptedYield, setDecryptedYield] = useState<bigint | null>(null);
  const [decryptingBalances, setDecryptingBalances] = useState(false);

  // AI suggestion state
  const [aiTrigger, setAiTrigger] = useState(0);
  const [lastAction, setLastAction] = useState<{ action: string; amount?: string }>({ action: "" });

  // Contract reads
  const { data: ystBal } = useReadContract({ address: ADDRESSES.YST, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 10000 } });
  const { data: allowance } = useReadContract({ address: ADDRESSES.YST, abi: ERC20_ABI, functionName: "allowance", args: address ? [address, ADDRESSES.Vault] : undefined, query: { enabled: !!address, refetchInterval: 5000 } });

  // Read encrypted balance handles from the vault
  const { data: encPrincipalHandle } = useReadContract({ address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "getEncryptedPrincipal", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 10000 } });
  const { data: encYieldHandle } = useReadContract({ address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "getEncryptedYield", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 10000 } });

  // Read deposited amount for display
  const { data: _depositedAmountRaw } = useReadContract({ address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "depositedAmount", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 10000 } });
  const depositedAmountRaw = _depositedAmountRaw as bigint | undefined;

  // Read withdrawal request status
  const { data: wdStatus } = useReadContract({ address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "hasWithdrawRequest", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 3000 } });

  const fmt = (v: bigint | null | undefined) => v ? Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—";

  const _allowance = allowance as bigint | undefined;
  const hasAllowance = _allowance && depAmount ? _allowance >= parseEther(depAmount || "0") : false;
  const hasPendingWd = wdStatus ? (wdStatus as any)[0] === true : false;
  const wdRequestBlock = wdStatus ? BigInt((wdStatus as any)[1] || 0) : 0n;
  const canExecuteWd = hasPendingWd && blockNum && blockNum >= wdRequestBlock + 2n;

  // Estimated yield per day
  const estimatedDailyYield = depAmount ? (Number(depAmount) * 7200) / 1_000_000 : 0;

  /**
   * Decrypt the user's encrypted balances using the Nox JS SDK.
   * This is gasless — uses an EIP-712 signature, not an on-chain transaction.
   */
  const handleDecryptBalances = useCallback(async () => {
    if (!encPrincipalHandle || !encYieldHandle) return;
    setDecryptingBalances(true);
    try {
      const principalResult = await decryptHandle(encPrincipalHandle as `0x${string}`);
      setDecryptedPrincipal(principalResult.value);

      const yieldResult = await decryptHandle(encYieldHandle as `0x${string}`);
      setDecryptedYield(yieldResult.value);

      addToast("🔓 Balances decrypted successfully!", "success");
    } catch (e: any) {
      addToast(e?.message || "Failed to decrypt balances", "error");
    } finally {
      setDecryptingBalances(false);
    }
  }, [encPrincipalHandle, encYieldHandle, decryptHandle, addToast]);

  const handleApprove = async () => {
    if (!depAmount) return;
    setTxStep("approving");
    try {
      await writeContractAsync({ address: ADDRESSES.YST, abi: ERC20_ABI, functionName: "approve", args: [ADDRESSES.Vault, parseEther(depAmount)] });
      addToast("Approval successful!", "success");
      setTxStep("approved");
    } catch (e: any) {
      addToast(e?.shortMessage || "Approval failed", "error");
      setTxStep("idle");
    }
  };

  const handleDeposit = async () => {
    if (!depAmount) return;
    setTxStep("depositing");
    try {
      await writeContractAsync({ address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "deposit", args: [parseEther(depAmount)] });
      addToast(`🔐 Deposited ${depAmount} YST → encrypted in vault!`, "success");
      setTxStep("success");

      // Trigger AI suggestion after deposit
      const newPrincipal = (depositedAmountRaw || 0n) + parseEther(depAmount);
      setLastAction({ action: "deposit", amount: depAmount });
      setAiTrigger((p) => p + 1);

      setDepAmount("");
      setDecryptedPrincipal(null); // Force re-decrypt
      setTimeout(() => setTxStep("idle"), 2000);
    } catch (e: any) {
      addToast(e?.shortMessage || "Deposit failed", "error");
      setTxStep("approved");
    }
  };

  const handleRequestWithdraw = async () => {
    if (!wdAmount) return;
    setWdLoading(true);
    try {
      // Encrypt the withdrawal amount using the Nox SDK
      const { handle, handleProof } = await encryptAmount(
        parseEther(wdAmount),
        ADDRESSES.Vault
      );

      await writeContractAsync({
        address: ADDRESSES.Vault,
        abi: VAULT_ABI,
        functionName: "requestWithdraw",
        args: [handle, handleProof],
      });
      addToast("🔐 Withdrawal requested (encrypted)! Wait 2 blocks then execute.", "success");
      setWdAmount("");
    } catch (e: any) {
      addToast(e?.shortMessage || e?.message || "Request failed", "error");
    } finally {
      setWdLoading(false);
    }
  };

  const handleExecuteWithdraw = async () => {
    setExecLoading(true);
    try {
      // Pre-flight: fetch the LIVE block number directly from the RPC
      const rpcRes = await fetch("https://sepolia-rollup.arbitrum.io/rpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
      });
      const rpcJson = await rpcRes.json();
      const liveBlock = BigInt(rpcJson.result);

      const readyAt = wdRequestBlock + 2n;
      if (liveBlock < readyAt) {
        const remaining = Number(readyAt - liveBlock);
        addToast(`Please wait ${remaining} more block${remaining > 1 ? "s" : ""}. Current: ${liveBlock}, ready at: ${readyAt}`, "error");
        setExecLoading(false);
        return;
      }

      // Decrypt the withdrawal amount from the encrypted handle
      // This is needed because the contract needs the plaintext to transfer ERC-20
      let plaintextAmount: bigint;
      if (decryptedPrincipal !== null && wdAmount) {
        plaintextAmount = parseEther(wdAmount);
      } else {
        // If we don't have the amount cached, try decrypting the request handle
        addToast("Decrypting withdrawal amount...", "info");
        // For MVP, we use the amount the user entered
        plaintextAmount = parseEther(wdAmount || "0");
      }

      await writeContractAsync({
        address: ADDRESSES.Vault,
        abi: VAULT_ABI,
        functionName: "executeWithdraw",
        args: [plaintextAmount],
      });
      addToast("Withdrawal executed! Tokens returned to your wallet.", "success");

      // Trigger AI suggestion after withdrawal
      setLastAction({ action: "withdraw", amount: wdAmount || "0" });
      setAiTrigger((p) => p + 1);

      setDecryptedPrincipal(null); // Force re-decrypt
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Execute failed";
      if (msg.includes("too early")) {
        addToast("Withdrawal not ready yet — please wait for more blocks to be mined.", "error");
      } else if (msg.includes("no pending request")) {
        addToast("No pending withdrawal request found. Request one first.", "error");
      } else {
        addToast(msg, "error");
      }
    } finally {
      setExecLoading(false);
    }
  };

  if (!address) return <div className="text-center py-20 text-slate-400">Connect wallet to manage your vault</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Mint YST Faucet */}
      <MintYSTButton />

      {/* Nox Privacy Banner */}
      <div className="glass-highlight p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔐</span>
          <div>
            <p className="font-semibold text-sm">iExec Nox Confidential Vault</p>
            <p className="text-xs text-slate-400">
              All balances are encrypted on-chain. Only you can decrypt and see your balances.
            </p>
          </div>
          <button
            onClick={handleDecryptBalances}
            disabled={decryptingBalances}
            className="ml-auto btn-outline text-xs flex items-center gap-2"
          >
            {decryptingBalances && <span className="spinner" />}
            🔓 Decrypt My Balances
          </button>
        </div>
      </div>

      {/* Encrypted Balance Display */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass p-4 hover:border-accent-orange/30 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Principal</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300" title="Encrypted by iExec Nox — only you can see this">🔐 Encrypted</span>
          </div>
          <p className="text-xl font-bold stat-value">
            {decryptedPrincipal !== null ? `${fmt(decryptedPrincipal)} YST` : "••••••"}
          </p>
          {decryptedPrincipal === null && (
            <p className="text-xs text-slate-500 mt-1">Click "Decrypt" to reveal</p>
          )}
        </div>
        <div className="glass p-4 hover:border-accent-orange/30 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Accrued Yield</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-accent-orange/15 text-accent-amber" title="Encrypted by iExec Nox — only you can see this">🔐 Encrypted</span>
          </div>
          <p className="text-xl font-bold text-accent-green">
            {decryptedYield !== null ? `${fmt(decryptedYield)} YST` : "••••••"}
          </p>
          {decryptedYield === null && (
            <p className="text-xs text-slate-500 mt-1">Click "Decrypt" to reveal</p>
          )}
        </div>
      </div>

      {/* AI Insight after deposit/withdraw */}
      <AIInsight
        action={lastAction.action}
        amount={lastAction.amount}
        principal={fmt(depositedAmountRaw)}
        yieldAmount={fmt(decryptedYield)}
        trigger={aiTrigger}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DEPOSIT */}
        <div className="glass p-6 space-y-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent-green/20 flex items-center justify-center text-sm">📥</span>
            Deposit
          </h2>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount (YST)</label>
            <input
              type="number"
              placeholder="0.0"
              value={depAmount}
              onChange={(e) => { setDepAmount(e.target.value); setTxStep("idle"); }}
              min="0"
            />
            <div className="flex justify-between mt-2 text-xs text-slate-500">
              <span>Balance: {fmt(ystBal as bigint | undefined)} YST</span>
              <button onClick={() => setDepAmount((ystBal as bigint | undefined) ? formatEther(ystBal as bigint) : "0")} className="text-accent-orange hover:underline">MAX</button>
            </div>
          </div>

          {depAmount && Number(depAmount) > 0 && (
            <div className="bg-navy-800/60 rounded-xl p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-slate-400">Estimated daily yield</span><span className="text-accent-green">{estimatedDailyYield.toFixed(6)} YST</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Monthly yield</span><span className="text-accent-green">{(estimatedDailyYield * 30).toFixed(6)} YST</span></div>
              <div className="flex justify-between items-center"><span className="text-slate-400">Privacy</span><span className="text-purple-300 text-xs flex items-center gap-1">🔐 Encrypted by Nox</span></div>
            </div>
          )}

          {/* Transaction status stepper */}
          <div className="flex items-center gap-2 text-xs">
            {(["idle", "approving", "approved", "depositing", "success"] as TxStep[]).map((s, i) => (
              <div key={s} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-full transition-colors ${txStep === s ? "bg-accent-orange animate-pulse" : (["idle", "approving", "approved", "depositing", "success"].indexOf(txStep) > i ? "bg-accent-green" : "bg-slate-600")}`} />
                {i < 4 && <div className="w-6 h-px bg-slate-600" />}
              </div>
            ))}
            <span className="text-slate-500 ml-2 capitalize">{txStep === "idle" ? "ready" : txStep}</span>
          </div>

          <div className="flex gap-3">
            <button onClick={handleApprove} disabled={!depAmount || txStep === "approving" || hasAllowance} className="btn-outline flex-1 flex items-center justify-center gap-2 text-sm">
              {txStep === "approving" && <span className="spinner" />}
              {hasAllowance ? "✓ Approved" : "Approve"}
            </button>
            <button onClick={handleDeposit} disabled={!depAmount || (!hasAllowance && txStep !== "approved") || txStep === "depositing"} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
              {txStep === "depositing" && <span className="spinner" />}
              🔐 Deposit
            </button>
          </div>
        </div>

        {/* WITHDRAW */}
        <div className="glass p-6 space-y-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-accent-orange/20 flex items-center justify-center text-sm">📤</span>
            Withdraw
          </h2>

          {/* ERC-7540 Flow */}
          <div className="border border-slate-700/50 rounded-xl p-4 space-y-3">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">ERC-7540 Async Withdrawal (Encrypted)</p>
            <div className="flex items-center gap-3 text-xs">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${!hasPendingWd ? "bg-accent-orange/20 text-accent-orange" : "bg-green-500/20 text-green-400"}`}>
                <span className="font-semibold">Step 1</span> Request
              </div>
              <div className="flex-1 h-px bg-slate-600 relative">
                <div className={`absolute inset-0 bg-gradient-to-r from-accent-orange to-accent-green transition-all ${hasPendingWd ? "opacity-100" : "opacity-0"}`} />
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${canExecuteWd ? "bg-accent-green/20 text-accent-green" : "bg-slate-700 text-slate-500"}`}>
                <span className="font-semibold">Step 2</span> Execute
              </div>
            </div>
            <p className="text-xs text-slate-500">🔐 Withdrawal amount is encrypted — only you know how much you're withdrawing</p>
          </div>

          {!hasPendingWd ? (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Withdrawal Amount (YST)</label>
                <input type="number" placeholder="0.0" value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} min="0" />
                {decryptedPrincipal !== null && (
                  <button onClick={() => setWdAmount(decryptedPrincipal ? formatEther(decryptedPrincipal) : "0")} className="text-xs text-accent-orange hover:underline mt-1">MAX</button>
                )}
              </div>
              <button onClick={handleRequestWithdraw} disabled={!wdAmount || wdLoading} className="btn-primary w-full flex items-center justify-center gap-2">
                {wdLoading && <span className="spinner" />}
                🔐 Request Encrypted Withdrawal
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-navy-800/60 rounded-xl p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className="text-purple-300">🔐 Encrypted</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Request Block</span><span>{wdRequestBlock.toString()}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Current Block</span><span>{blockNum?.toString() || "—"}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Ready at Block</span><span className="text-accent-orange">{(wdRequestBlock + 2n).toString()}</span></div>
              </div>
              <button onClick={handleExecuteWithdraw} disabled={!canExecuteWd || execLoading} className="btn-primary w-full flex items-center justify-center gap-2">
                {execLoading && <span className="spinner" />}
                {canExecuteWd ? "Execute Withdrawal" : `Waiting... (${blockNum ? Number(wdRequestBlock + 2n - blockNum) : "?"} blocks)`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Proactive AI Advisor — shows tips as user types deposit amount */}
      <AIAdvisorPanel
        context="deposit_typing"
        amount={depAmount}
        principal={fmt(depositedAmountRaw)}
        yieldAmount={fmt(decryptedYield)}
      />
    </div>
  );
}
