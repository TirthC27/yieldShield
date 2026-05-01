import { useAccount, useReadContract, useWriteContract, useBlockNumber } from "wagmi";
import { formatEther } from "viem";
import { ADDRESSES, VAULT_ABI, GUARDIAN_ABI, POSITION_MANAGER_ABI } from "../config/contracts";
import { useToast } from "../context/ToastContext";
import { Area, AreaChart, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import GuardianCard from "./GuardianCard";
import AIInsight from "./AIInsight";
import MintYSTButton from "./MintYSTButton";
import { useState, useMemo, useCallback } from "react";
import { useNoxSDK } from "../hooks/useNoxSDK";

// Rate: 1/1_000_000 per block. At ~7200 blocks/day = 0.72% per day.
const YIELD_RATE_DENOM = 1_000_000n;
const BLOCKS_PER_DAY = 7200;

function StatCard({
  label, value, sub, icon, encrypted, badge,
}: {
  label: string; value: string; sub?: string; icon: string; encrypted?: boolean; badge?: React.ReactNode;
}) {
  return (
    <div className="glass p-5 flex items-start gap-4 group hover:border-accent-orange/30 transition-all">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-orange/20 to-accent-amber/10 flex items-center justify-center text-xl shrink-0 group-hover:shadow-lg group-hover:shadow-accent-orange/10 transition-all">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-slate-400 uppercase tracking-wider">{label}</p>
          {encrypted && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300" title="Encrypted by iExec Nox">🔐</span>
          )}
          {badge}
        </div>
        <p className="text-xl font-bold stat-value truncate">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { address } = useAccount();
  const { addToast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const { data: blockNum } = useBlockNumber({ watch: true });
  const { decryptHandle } = useNoxSDK();

  // State
  const [principal, setPrincipal] = useState<bigint | null>(null);
  const [yieldDecrypted, setYieldDecrypted] = useState<bigint | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [accruing, setAccruing] = useState(false);
  const [aiTrigger, setAiTrigger] = useState(0);
  const [lastAction, setLastAction] = useState<{ action: string; amount?: string }>({ action: "" });

  // On-chain reads
  const { data: encPrincipalHandle, refetch: refetchPrincipal } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "getEncryptedPrincipal",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: encYieldHandle, refetch: refetchYield } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "getEncryptedYield",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  // Plaintext yield ESTIMATE (not confidential — based on deposited amount + blocks elapsed)
  const { data: yieldEstimate, refetch: refetchEstimate } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "getYieldEstimate",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 4000 },
  });

  // Plaintext deposited amount (mirror for UI)
  const { data: depositedAmountRaw, refetch: refetchDeposited } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "depositedAmount",
    args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 10000 },
  });

  const { data: depositCount } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "depositCount",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: lastYieldBlock } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "lastYieldBlock",
    args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 4000 },
  });
  const { data: isInitialized } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "initialized",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  const { data: guardianId } = useReadContract({
    address: ADDRESSES.GuardianNFT, abi: GUARDIAN_ABI, functionName: "guardianOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const _guardianId = guardianId as bigint | undefined;

  const { data: guardianLevel } = useReadContract({
    address: ADDRESSES.GuardianNFT, abi: GUARDIAN_ABI, functionName: "level",
    args: _guardianId ? [_guardianId] : undefined, query: { enabled: !!_guardianId && _guardianId > 0n },
  });
  const { data: posIds } = useReadContract({
    address: ADDRESSES.PositionManager, abi: POSITION_MANAGER_ABI, functionName: "getUserPositions",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  // Computed values
  const activeCount = posIds ? (posIds as bigint[]).length : 0;
  const _guardianLevel = guardianLevel as bigint | undefined;
  const level = _guardianLevel ? Number(_guardianLevel) : (_guardianId && _guardianId > 0n ? 1 : 0);
  const depositedEth = (depositedAmountRaw as bigint | undefined) ?? 0n;

  // Live yield estimate in bigint (updates every 4s as blocks tick)
  const liveYieldEstimate: bigint = (yieldEstimate as bigint | undefined) ?? 0n;

  // Show decrypted yield if available, else live estimate
  const displayYield = yieldDecrypted !== null ? yieldDecrypted : liveYieldEstimate;
  const displayPrincipal = principal !== null ? principal : depositedEth;

  // Blocks since last accrue
  const blocksSinceAccrue = blockNum && lastYieldBlock ? Number(blockNum) - Number(lastYieldBlock) : 0;

  const fmt = (v: bigint | null | undefined, fallback = "0") =>
    v !== null && v !== undefined
      ? Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 })
      : fallback;

  // Snapshot yield on-chain, then refresh estimate
  const handleAccrueYield = async () => {
    setAccruing(true);
    try {
      await writeContractAsync({
        address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "accrueMyYield",
      });
      await Promise.all([refetchYield(), refetchEstimate(), refetchDeposited()]);
      addToast("✅ Yield snapshotted on-chain!", "success");
    } catch (e: any) {
      addToast(e?.shortMessage || "Failed to accrue yield", "error");
    } finally {
      setAccruing(false);
    }
  };

  /**
   * Decrypt encrypted balances using the Nox JS SDK.
   * Zero / public handles (chainId=0) are handled transparently — they return 0n.
   * Call accrueMyYield first to push pending blocks into the encrypted handle.
   */
  const handleDecrypt = useCallback(async () => {
    if (!isInitialized) {
      addToast("No vault activity yet. Deposit first.", "error");
      return;
    }

    setDecrypting(true);
    try {
      // First snapshot any pending yield into the encrypted handle
      if (blocksSinceAccrue > 0) {
        await writeContractAsync({
          address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "accrueMyYield",
        });
      }

      const pResult = await decryptHandle(encPrincipalHandle as `0x${string}`);
      setPrincipal(pResult.value);

      const yResult = await decryptHandle(encYieldHandle as `0x${string}`);
      setYieldDecrypted(yResult.value);

      addToast("🔓 Balances decrypted!", "success");
    } catch (e: any) {
      addToast(e?.message || "Decryption failed", "error");
    } finally {
      setDecrypting(false);
    }
  }, [isInitialized, blocksSinceAccrue, encPrincipalHandle, encYieldHandle, decryptHandle, writeContractAsync, addToast]);

  const handleCollect = async () => {
    if (!address) return;
    setCollecting(true);
    try {
      await writeContractAsync({
        address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "collectYield", args: [address],
      });
      addToast("Yield collected successfully!", "success");

      // Trigger AI suggestion after collecting yield
      setLastAction({
        action: "collect_yield",
        amount: fmt(displayYield),
      });
      setAiTrigger((p) => p + 1);

      setYieldDecrypted(0n);
      refetchEstimate();
    } catch (e: any) {
      addToast(e?.shortMessage || "Failed to collect yield", "error");
    } finally {
      setCollecting(false);
    }
  };

  // Yield projection chart
  const chartData = useMemo(() => {
    const p = Number(formatEther(depositedEth || 0n));
    return Array.from({ length: 31 }, (_, i) => ({
      day: `D${i}`,
      yield: Number(((p * BLOCKS_PER_DAY * i) / Number(YIELD_RATE_DENOM)).toFixed(6)),
    }));
  }, [depositedEth]);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-6 animate-fade-in">
        <div className="text-6xl">🛡️</div>
        <h2 className="text-2xl font-bold text-gradient-orange">Welcome to YOLDR</h2>
        <p className="text-slate-400 text-center max-w-md">
          Connect your wallet to view your principal-protected vault, accrued yield, and leveraged positions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Your Vault header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Your Vault</h2>
          <p className="text-sm text-slate-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-green" />
            Flow Testnet · Principal-protected yield
          </p>
        </div>
        <span className="badge-apy flex items-center gap-1">
          📈 5% APY
        </span>
      </div>

      {/* Nox Privacy Banner */}
      <div className="glass-highlight p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔐</span>
          <div>
            <p className="font-semibold text-sm">Confidential Balances — Powered by iExec Nox</p>
            <p className="text-xs text-slate-400">
              Principal is encrypted on-chain via <code className="text-purple-300">euint256</code>.
              Yield estimate shown live from block data.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {blocksSinceAccrue > 10 && (
            <button
              onClick={handleAccrueYield}
              disabled={accruing}
              className="btn-outline whitespace-nowrap flex items-center gap-2 text-xs"
              title={`${blocksSinceAccrue} blocks of yield not yet snapshotted`}
            >
              {accruing && <span className="spinner" />}
              ⚡ Snapshot Yield
            </button>
          )}
          <button
            onClick={handleDecrypt}
            disabled={decrypting || !isInitialized}
            className="btn-outline whitespace-nowrap flex items-center gap-2 text-sm"
          >
            {decrypting && <span className="spinner" />}
            🔓 Decrypt Exact Balances
          </button>
        </div>
      </div>

      {/* Faucet */}
      <MintYSTButton />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon="🏦"
          label="Your Principal"
          value={depositedEth > 0n ? `${fmt(displayPrincipal)} YST` : "No deposits yet"}
          sub={principal !== null ? "Exact (decrypted)" : "From deposit records"}
          encrypted={principal !== null}
        />
        <StatCard
          icon="💰"
          label="Accrued Yield"
          value={depositedEth > 0n ? `${fmt(displayYield)} YST` : "—"}
          sub={
            yieldDecrypted !== null
              ? "Exact (decrypted)"
              : blocksSinceAccrue > 0
              ? `Live estimate · ${blocksSinceAccrue} blocks`
              : "Snapshot up to date"
          }
          badge={
            yieldDecrypted !== null ? (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-300">✓ Exact</span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">~ Est.</span>
            )
          }
        />
        <StatCard
          icon="📊"
          label="Active Positions"
          value={String(activeCount)}
          sub={`${depositCount ? Number(depositCount) : 0} total deposits`}
        />
        <StatCard
          icon="🛡️"
          label="Guardian Level"
          value={level > 0 ? `Level ${level}` : "No Guardian"}
          sub={level > 0 ? "Keep depositing to evolve" : "Mint one to start"}
        />
      </div>

      {/* Yield actions */}
      {liveYieldEstimate > 0n && (
        <div className="glass p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-semibold">
              ~{fmt(liveYieldEstimate)} YST in estimated yield
              {yieldDecrypted !== null && <span className="text-green-400 ml-2">(exact: {fmt(yieldDecrypted)} YST 🔐)</span>}
            </p>
            <p className="text-sm text-slate-400">
              Accruing at 0.0001%/block · {blocksSinceAccrue} blocks since last snapshot
            </p>
          </div>
          <button onClick={handleCollect} disabled={collecting} className="btn-primary whitespace-nowrap flex items-center gap-2">
            {collecting && <span className="spinner" />}
            Collect Yield
          </button>
        </div>
      )}

      {/* AI Insight after collect */}
      <AIInsight
        action={lastAction.action}
        amount={lastAction.amount}
        principal={fmt(displayPrincipal)}
        yieldAmount={fmt(displayYield)}
        positions={activeCount}
        trigger={aiTrigger}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Yield chart */}
        <div className="glass p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Yield Growth</h3>
              <p className="text-xs text-slate-500">0d earned · 30d projection</p>
            </div>
            {depositedEth > 0n && (
              <div className="text-right">
                <p className="text-xs text-slate-500">EST. 30D YIELD</p>
                <p className="text-sm font-bold text-accent-green">
                  +{fmt(BigInt(Math.floor(Number(formatEther(depositedEth)) * BLOCKS_PER_DAY * 30 / Number(YIELD_RATE_DENOM) * 1e18) | 0))} FLOW
                </p>
              </div>
            )}
          </div>
          {depositedEth > 0n ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="yieldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} interval={5} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={55} tickFormatter={(v) => v.toFixed(4)} />
                <Tooltip
                  contentStyle={{ background: "#0f1629", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, color: "#e2e8f0" }}
                  formatter={(v: any) => [`${Number(v).toFixed(6)} YST`, "Yield"]}
                />
                <Area type="monotone" dataKey="yield" stroke="#f59e0b" strokeWidth={2} fill="url(#yieldGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-slate-500">
              <span className="text-4xl opacity-30">📈</span>
              <p>Deposit YST to see your yield projection</p>
            </div>
          )}
        </div>

        {/* Guardian */}
        {level > 0 ? (
          <GuardianCard level={level} />
        ) : (
          <div className="glass p-6 flex flex-col items-center justify-center gap-4">
            <div className="text-5xl opacity-30">🛡️</div>
            <p className="text-slate-400 text-center text-sm">Mint a Guardian NFT to track your journey</p>
          </div>
        )}
      </div>

      {/* Privacy breakdown */}
      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
          How Your Privacy Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-start gap-3 bg-navy-800/40 rounded-xl p-4">
            <span className="text-2xl shrink-0">🔐</span>
            <div>
              <p className="font-semibold text-sm">Principal (euint256)</p>
              <p className="text-xs text-slate-400 mt-1">Exact balance encrypted on-chain. Requires EIP-712 signature to view.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-navy-800/40 rounded-xl p-4">
            <span className="text-2xl shrink-0">⚡</span>
            <div>
              <p className="font-semibold text-sm">Yield (Live Estimate)</p>
              <p className="text-xs text-slate-400 mt-1">Estimated from public block data. Decrypt for exact encrypted value.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-navy-800/40 rounded-xl p-4">
            <span className="text-2xl shrink-0">🛡️</span>
            <div>
              <p className="font-semibold text-sm">Positions (ebool)</p>
              <p className="text-xs text-slate-400 mt-1">Trade size & direction encrypted. MEV bots see nothing.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center text-xs text-slate-600">
        Block #{blockNum?.toString() ?? "—"} · {blocksSinceAccrue} blocks since yield snapshot
      </div>
    </div>
  );
}
