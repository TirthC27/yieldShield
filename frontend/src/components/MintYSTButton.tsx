import { useState } from "react";
import { useAccount } from "wagmi";
import { useToast } from "../context/ToastContext";

// Backend API base — set VITE_API_URL in your deployment env vars
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function MintYSTButton() {
  const { address } = useAccount();
  const { addToast } = useToast();
  const [minting, setMinting] = useState(false);
  const [mintAmount, setMintAmount] = useState("1000");
  const [showInput, setShowInput] = useState(false);

  const handleMint = async () => {
    if (!address) {
      addToast("Connect your wallet first", "error");
      return;
    }
    setMinting(true);
    try {
      const res = await fetch(`${API_BASE}/api/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: address, amount: mintAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mint failed");
      addToast(`🪙 Minted ${mintAmount} YST to your wallet! Tx: ${data.txHash?.slice(0, 10)}...`, "success");
      setShowInput(false);
    } catch (e: any) {
      addToast(e.message || "Failed to mint tokens", "error");
    } finally {
      setMinting(false);
    }
  };

  if (!address) return null;

  return (
    <div className="glass p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-accent-green/20">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-green/30 to-accent-orange/20 flex items-center justify-center text-xl">
          🪙
        </div>
        <div>
          <p className="font-semibold text-sm">YST Token Faucet</p>
          <p className="text-xs text-slate-400">
            Mint free test YST tokens on Arbitrum Sepolia
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showInput ? (
          <>
            <input
              type="number"
              value={mintAmount}
              onChange={(e) => setMintAmount(e.target.value)}
              className="!w-24 !py-2 !px-3 !text-sm !rounded-lg"
              min="1"
              max="10000"
            />
            <span className="text-xs text-slate-400">YST</span>
            <button
              onClick={handleMint}
              disabled={minting || !mintAmount}
              className="btn-primary !py-2 !px-4 text-sm flex items-center gap-2"
            >
              {minting && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
              Mint
            </button>
            <button
              onClick={() => setShowInput(false)}
              className="text-slate-500 hover:text-slate-300 text-sm px-2"
            >
              ×
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowInput(true)}
            className="btn-primary !py-2 !px-5 text-sm flex items-center gap-2"
          >
            🪙 Mint YST Tokens
          </button>
        )}
      </div>
    </div>
  );
}
