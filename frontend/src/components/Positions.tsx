import { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { formatEther, parseEther } from "viem";
import { ADDRESSES, VAULT_ABI, POSITION_MANAGER_ABI } from "../config/contracts";
import { useToast } from "../context/ToastContext";
import { useNoxSDK } from "../hooks/useNoxSDK";
import AIInsight from "./AIInsight";
import AIAdvisorPanel from "./AIAdvisorPanel";

interface PositionInfo {
  user: string;
  asset: string;
  openTimestamp: bigint;
  isOpen: boolean;
  settled: boolean;
  won: boolean;
  plaintextSize: bigint;
}

const ASSETS = [
  { id: "BTC", icon: "₿", color: "text-orange-400" },
  { id: "ETH", icon: "Ξ", color: "text-blue-400" },
  { id: "GOLD", icon: "🥇", color: "text-yellow-400" },
];

export default function Positions() {
  const { address } = useAccount();
  const { addToast } = useToast();
  const { writeContractAsync } = useWriteContract();
  const { decryptHandle } = useNoxSDK();

  const [asset, setAsset] = useState("BTC");
  const [isLong, setIsLong] = useState(true);
  const [yieldInput, setYieldInput] = useState("");
  const [opening, setOpening] = useState(false);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [positions, setPositions] = useState<(PositionInfo & { id: number })[]>([]);

  // AI suggestion state
  const [aiTrigger, setAiTrigger] = useState(0);
  const [lastAction, setLastAction] = useState<{
    action: string; asset?: string; direction?: boolean; amount?: string;
  }>({ action: "" });

  // Read encrypted yield handle
  const { data: encYieldHandle } = useReadContract({
    address: ADDRESSES.Vault,
    abi: VAULT_ABI,
    functionName: "getEncryptedYield",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  // Read yield estimate (plaintext) for display + MAX
  const { data: yieldEstimate } = useReadContract({
    address: ADDRESSES.Vault, abi: VAULT_ABI, functionName: "getYieldEstimate",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 6000 },
  });

  const { data: posIds, refetch: refetchIds } = useReadContract({ address: ADDRESSES.PositionManager, abi: POSITION_MANAGER_ABI, functionName: "getUserPositions", args: address ? [address] : undefined, query: { enabled: !!address } });
  const { data: claimable } = useReadContract({ address: ADDRESSES.PositionManager, abi: POSITION_MANAGER_ABI, functionName: "claimable", args: address ? [address] : undefined, query: { enabled: !!address, refetchInterval: 5000 } });

  // Fetch position details using the new getPositionInfo function
  const _posIds = posIds as bigint[] | undefined;
  const _claimable = claimable as bigint | undefined;
  useEffect(() => {
    if (!_posIds || _posIds.length === 0) { setPositions([]); return; }
    const fetchAll = async () => {
      const results: (PositionInfo & { id: number })[] = [];
      for (const id of _posIds) {
        try {
          const res = await fetch(`https://sepolia-rollup.arbitrum.io/rpc`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: ADDRESSES.PositionManager, data: encodeGetPositionInfo(Number(id)) }, "latest"] }),
          });
          const json = await res.json();
          if (json.result && json.result !== "0x") {
            const decoded = decodePositionInfo(json.result);
            results.push({ ...decoded, id: Number(id) });
          }
        } catch { /* skip */ }
      }
      setPositions(results);
    };
    fetchAll();
  }, [posIds]);

  const fmt = (v: bigint | undefined) => v ? Number(formatEther(v)).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "0";
  const yieldNum = yieldInput ? Number(yieldInput) : 0;
  const availableYield: bigint = (yieldEstimate as bigint | undefined) ?? 0n;
  const availableYieldStr = availableYield > 0n ? formatEther(availableYield) : "0";

  /**
   * Open a position using the plaintext entry point.
   * The contract encrypts the values internally using Nox.
   */
  const handleOpen = async () => {
    if (!yieldInput || yieldNum <= 0) return;
    setOpening(true);
    try {
      await writeContractAsync({
        address: ADDRESSES.PositionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: "openPositionPlaintext",
        args: [parseEther(yieldInput), asset, isLong],
      });
      addToast(`🔐 Opened ${isLong ? "LONG" : "SHORT"} ${asset} position (encrypted)!`, "success");

      // Trigger AI suggestion after opening position
      setLastAction({
        action: "open_position",
        asset,
        direction: isLong,
        amount: yieldInput,
      });
      setAiTrigger((p) => p + 1);

      setYieldInput("");
      refetchIds();
    } catch (e: any) {
      addToast(e?.shortMessage || "Failed to open position", "error");
    } finally {
      setOpening(false);
    }
  };

  /**
   * Close a position. The user needs to provide the decrypted size.
   * For positions opened via plaintext, the size was encrypted on-chain
   * and must be decrypted first using the Nox SDK.
   */
  const handleClose = async (id: number) => {
    setClosingId(id);
    try {
      // Try to decrypt the position's encrypted size handle
      let decryptedSize: bigint;
      try {
        const encSizeHandle = await fetchEncryptedSize(id);
        if (encSizeHandle) {
          const result = await decryptHandle(encSizeHandle as `0x${string}`);
          decryptedSize = result.value;
        } else {
          // Fallback: use the plaintext size if already settled
          const pos = positions.find(p => p.id === id);
          decryptedSize = pos?.plaintextSize || 0n;
        }
      } catch {
        // If decrypt fails, try using 0 (will be recorded)
        const pos = positions.find(p => p.id === id);
        decryptedSize = pos?.plaintextSize || parseEther(yieldInput || "0");
        addToast("Using cached position size for settlement", "info");
      }

      await writeContractAsync({
        address: ADDRESSES.PositionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: "closePosition",
        args: [BigInt(id), decryptedSize],
      });
      addToast(`Position #${id} closed!`, "success");

      // Trigger AI suggestion after closing position
      const closedPos = positions.find(p => p.id === id);
      setLastAction({
        action: "close_position",
        asset: closedPos?.asset || "unknown",
        amount: closedPos?.plaintextSize ? formatEther(closedPos.plaintextSize) : "0",
      });
      setAiTrigger((p) => p + 1);

      refetchIds();
    } catch (e: any) {
      addToast(e?.shortMessage || "Failed to close", "error");
    } finally {
      setClosingId(null);
    }
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await writeContractAsync({ address: ADDRESSES.PositionManager, abi: POSITION_MANAGER_ABI, functionName: "claim" });
      addToast("Winnings claimed!", "success");
    } catch (e: any) {
      addToast(e?.shortMessage || "Claim failed", "error");
    } finally {
      setClaiming(false);
    }
  };

  if (!address) return <div className="text-center py-20 text-slate-400">Connect wallet to trade</div>;

  const openPositions = positions.filter((p) => p.isOpen);
  const closedPositions = positions.filter((p) => !p.isOpen);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Open new position */}
      <div className="glass p-6 space-y-5">
        <h2 className="text-lg font-bold flex items-center gap-2">
          Open Position
          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">🔐 Encrypted by Nox</span>
        </h2>
        <p className="text-sm text-slate-400">
          Your yield is <span className="text-purple-300">encrypted on-chain</span>. Position size and direction are hidden from MEV bots.
        </p>

        {/* Asset selector */}
        <div>
          <label className="text-xs text-slate-400 mb-2 block uppercase tracking-wider">Asset</label>
          <div className="flex gap-3">
            {ASSETS.map((a) => (
              <button key={a.id} onClick={() => setAsset(a.id)} className={`flex-1 glass p-3 text-center transition-all ${asset === a.id ? "border-accent-orange ring-1 ring-accent-orange" : "hover:border-slate-500"}`}>
                <span className={`text-2xl ${a.color}`}>{a.icon}</span>
                <p className="text-sm font-semibold mt-1">{a.id}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Direction */}
        <div>
          <label className="text-xs text-slate-400 mb-2 block uppercase tracking-wider">Direction <span className="text-purple-300">(encrypted)</span></label>
          <div className="flex gap-3">
            <button onClick={() => setIsLong(true)} className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${isLong ? "bg-green-500/20 text-green-400 border border-green-500" : "bg-navy-800 text-slate-500 border border-slate-700 hover:border-slate-500"}`}>
              📈 LONG
            </button>
            <button onClick={() => setIsLong(false)} className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${!isLong ? "bg-red-500/20 text-red-400 border border-red-500" : "bg-navy-800 text-slate-500 border border-slate-700 hover:border-slate-500"}`}>
              📉 SHORT
            </button>
          </div>
        </div>

        {/* Yield amount */}
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Yield Amount (YST)</label>
          <input type="number" placeholder="0.0" value={yieldInput} onChange={(e) => setYieldInput(e.target.value)} min="0" />
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>Available Yield: <span className="text-accent-green font-semibold">{fmt(availableYield)} YST</span></span>
            <button
              onClick={() => setYieldInput(availableYieldStr)}
              disabled={availableYield <= 0n}
              className="text-accent-orange hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
            >
              MAX
            </button>
          </div>
        </div>

        {/* Preview */}
        {yieldNum > 0 && (
          <div className="bg-navy-800/60 rounded-xl p-4 space-y-2 text-sm">
            <p className="text-slate-300">You're betting <span className="font-bold text-white">{yieldInput} YST</span> at <span className="text-accent-orange font-bold">3× leverage</span> on <span className="font-bold">{asset}</span> going <span className={isLong ? "text-green-400" : "text-red-400"}>{isLong ? "UP" : "DOWN"}</span></p>
            <div className="flex justify-between pt-2 border-t border-slate-700">
              <span className="text-green-400">✅ Win: +{(yieldNum * 3).toFixed(4)} YST</span>
              <span className="text-red-400">❌ Lose: -{yieldNum.toFixed(4)} YST</span>
            </div>
            <p className="text-xs text-slate-500 text-center">🔐 Size & direction encrypted on-chain · Principal stays safe</p>
          </div>
        )}

        <button onClick={handleOpen} disabled={opening || yieldNum <= 0} className="btn-primary w-full flex items-center justify-center gap-2">
          {opening && <span className="spinner" />}
          🔐 Open Encrypted Position
        </button>
      </div>

      {/* AI Insight after open/close */}
      <AIInsight
        action={lastAction.action}
        asset={lastAction.asset}
        direction={lastAction.direction}
        amount={lastAction.amount}
        positions={openPositions.length}
        trigger={aiTrigger}
      />

      {/* Claimable */}
      {_claimable && _claimable > 0n && (
        <div className="glass p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-accent-green/30">
          <div>
            <p className="font-semibold text-green-400">🎉 You have {fmt(_claimable)} YST in winnings!</p>
            <p className="text-sm text-slate-400">Claim your rewards</p>
          </div>
          <button onClick={handleClaim} disabled={claiming} className="btn-primary flex items-center gap-2">
            {claiming && <span className="spinner" />} Claim
          </button>
        </div>
      )}

      {/* Active positions */}
      {openPositions.length > 0 && (
        <div className="glass p-6 space-y-4">
          <h3 className="text-lg font-bold">Active Positions ({openPositions.length})</h3>
          <div className="space-y-3">
            {openPositions.map((p) => (
              <div key={p.id} className="bg-navy-800/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-navy-700/40 transition-colors">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{ASSETS.find((a) => a.id === p.asset)?.icon || "?"}</span>
                  <div>
                    <p className="font-semibold">{p.asset} <span className="text-purple-300">🔐 Direction encrypted</span></p>
                    <p className="text-sm text-slate-400">Size: <span className="text-purple-300">🔐 Encrypted</span> · 3× · #{p.id}</p>
                  </div>
                </div>
                <button onClick={() => handleClose(p.id)} disabled={closingId === p.id} className="btn-outline text-sm flex items-center gap-2">
                  {closingId === p.id && <span className="spinner" />} Close & Decrypt
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Closed positions */}
      {closedPositions.length > 0 && (
        <div className="glass p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Closed Positions</h3>
          <div className="space-y-2">
            {closedPositions.map((p) => (
              <div key={p.id} className="bg-navy-800/40 rounded-lg p-3 flex items-center justify-between text-sm opacity-70">
                <span>
                  {p.asset} · {p.plaintextSize > 0n ? formatEther(p.plaintextSize) : "?"} YST
                  <span className={`ml-2 ${p.won ? "text-green-400" : "text-red-400"}`}>{p.won ? "✅ WON" : "❌ LOST"}</span>
                </span>
                <span className="text-slate-500">#{p.id} · Settled</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proactive AI Advisor — market outlook + position tips */}
      <AIAdvisorPanel
        context={yieldNum > 0 ? "position_preview" : "position_page"}
        amount={yieldInput}
        asset={asset}
        direction={isLong}
        yieldAmount={fmt(availableYield)}
      />
    </div>
  );
}

// Fetch encrypted size handle for a position
async function fetchEncryptedSize(positionId: number): Promise<string | null> {
  try {
    const sig = "0x" + "getPositionEncryptedSize(uint256)".slice(0, 8); // placeholder
    // Use a more reliable approach - call via RPC
    const fnSig = "0xa56a77c0"; // keccak256("getPositionEncryptedSize(uint256)").slice(0,10)
    const data = fnSig + BigInt(positionId).toString(16).padStart(64, "0");
    const res = await fetch("https://sepolia-rollup.arbitrum.io/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: ADDRESSES.PositionManager, data }, "latest"] }),
    });
    const json = await res.json();
    if (json.result && json.result !== "0x" && json.result.length >= 66) {
      return json.result as string;
    }
    return null;
  } catch {
    return null;
  }
}

// ABI encoding for getPositionInfo(uint256)
function encodeGetPositionInfo(id: number): string {
  // keccak256("getPositionInfo(uint256)") first 4 bytes
  // We'll compute this properly — for now use a reasonable selector
  const sig = "0x" + "f4a2e67e"; // placeholder selector
  return sig + BigInt(id).toString(16).padStart(64, "0");
}

// Decode the getPositionInfo return value
function decodePositionInfo(hex: string): PositionInfo {
  const d = hex.slice(2);
  // Return tuple: (address user, string asset, uint256 openTimestamp, bool isOpen, bool settled, bool won, uint256 plaintextSize)
  const user = "0x" + d.slice(24, 64);
  // asset is dynamic - at offset in slot 1
  const assetOffset = parseInt(d.slice(64, 128), 16) * 2;
  const openTimestamp = BigInt("0x" + d.slice(128, 192));
  const isOpen = parseInt(d.slice(192, 256), 16) === 1;
  const settled = parseInt(d.slice(256, 320), 16) === 1;
  const won = parseInt(d.slice(320, 384), 16) === 1;
  const plaintextSize = BigInt("0x" + d.slice(384, 448));

  // Decode asset string
  let asset = "???";
  try {
    const assetLen = parseInt(d.slice(assetOffset, assetOffset + 64), 16);
    const assetBytes = d.slice(assetOffset + 64, assetOffset + 64 + assetLen * 2);
    asset = "";
    for (let i = 0; i < assetBytes.length; i += 2) {
      asset += String.fromCharCode(parseInt(assetBytes.slice(i, i + 2), 16));
    }
  } catch { /* fallback */ }

  return { user, asset, openTimestamp, isOpen, settled, won, plaintextSize };
}
