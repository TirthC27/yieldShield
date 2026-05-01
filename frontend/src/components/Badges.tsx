import { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import { ADDRESSES, BADGE_ABI } from "../config/contracts";

interface Badge { won: boolean; amount: bigint; asset: string; timestamp: bigint; }

export default function Badges() {
  const { address } = useAccount();
  const [badges, setBadges] = useState<(Badge & { id: number })[]>([]);

  const { data: _badgeIds } = useReadContract({ address: ADDRESSES.BadgeNFT, abi: BADGE_ABI, functionName: "getUserBadges", args: address ? [address] : undefined, query: { enabled: !!address } });
  const badgeIds = _badgeIds as bigint[] | undefined;

  useEffect(() => {
    if (!badgeIds || badgeIds.length === 0) { setBadges([]); return; }
    const fetchAll = async () => {
      const results: (Badge & { id: number })[] = [];
      for (const id of badgeIds) {
        try {
          const res = await fetch("https://sepolia-rollup.arbitrum.io/rpc", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: ADDRESSES.BadgeNFT, data: encodeBadges(Number(id)) }, "latest"] }),
          });
          const json = await res.json();
          if (json.result && json.result !== "0x") {
            const decoded = decodeBadge(json.result);
            results.push({ ...decoded, id: Number(id) });
          }
        } catch { /* skip */ }
      }
      setBadges(results);
    };
    fetchAll();
  }, [badgeIds]);

  const wins = badges.filter((b) => b.won).length;
  const total = badges.length;
  const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0";
  const totalUsed = badges.reduce((s, b) => s + Number(formatEther(b.amount)), 0);
  const totalReturned = badges.filter((b) => b.won).reduce((s, b) => s + Number(formatEther(b.amount)) * 3, 0);

  if (!address) return <div className="text-center py-20 text-slate-400">Connect wallet to view badges</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass p-5 text-center hover:border-accent-orange/30 transition-all">
          <p className="text-3xl font-bold text-gradient-orange">{winRate}%</p>
          <p className="text-xs text-slate-400 mt-1">Win Rate</p>
        </div>
        <div className="glass p-5 text-center hover:border-accent-orange/30 transition-all">
          <p className="text-3xl font-bold stat-value">{totalUsed.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">Total Yield Used (YST)</p>
        </div>
        <div className="glass p-5 text-center hover:border-accent-orange/30 transition-all">
          <p className="text-3xl font-bold text-accent-green">{totalReturned.toFixed(2)}</p>
          <p className="text-xs text-slate-400 mt-1">Total Yield Returned (YST)</p>
        </div>
      </div>

      {/* Badge grid */}
      {badges.length === 0 ? (
        <div className="glass p-12 text-center">
          <div className="text-5xl mb-4 opacity-30">🏅</div>
          <p className="text-slate-400">No trades yet. Open your first position to earn a badge.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {badges.map((b) => (
            <div key={b.id} className={`glass p-5 relative overflow-hidden transition-transform hover:scale-[1.02] ${b.won ? "border-green-500/30" : "border-red-500/30"}`}>
              {/* Badge number */}
              <span className="absolute top-3 right-3 text-xs text-slate-500 font-mono">#{String(b.id).padStart(3, "0")}</span>
              {/* Icon */}
              <div className="text-4xl mb-3">{b.won ? "🏆" : "💀"}</div>
              {/* Result */}
              <p className={`text-lg font-bold ${b.won ? "text-green-400" : "text-red-400"}`}>{b.won ? "WIN" : "LOSS"}</p>
              {/* Details */}
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-400">Asset</span><span className="font-semibold">{b.asset}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Amount</span><span>{Number(formatEther(b.amount)).toFixed(4)} YST</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Date</span><span>{new Date(Number(b.timestamp) * 1000).toLocaleDateString()}</span></div>
              </div>
              {/* Glow effect */}
              <div className={`absolute -bottom-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-20 ${b.won ? "bg-green-400" : "bg-red-400"}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function encodeBadges(id: number): string {
  const sig = "0x3656eec2"; // badges(uint256)
  return sig + BigInt(id).toString(16).padStart(64, "0");
}

function decodeBadge(hex: string): Badge {
  const d = hex.slice(2);
  const won = parseInt(d.slice(0, 64), 16) === 1;
  const amount = BigInt("0x" + d.slice(64, 128));
  // asset is dynamic - offset
  const assetOffset = parseInt(d.slice(128, 192), 16) * 2;
  const timestamp = BigInt("0x" + d.slice(192, 256));
  // Decode string
  const assetLen = parseInt(d.slice(assetOffset, assetOffset + 64), 16);
  const assetBytes = d.slice(assetOffset + 64, assetOffset + 64 + assetLen * 2);
  let asset = "";
  for (let i = 0; i < assetBytes.length; i += 2) {
    asset += String.fromCharCode(parseInt(assetBytes.slice(i, i + 2), 16));
  }
  return { won, amount, asset, timestamp };
}
