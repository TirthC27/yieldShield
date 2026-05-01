import { useState, useEffect } from "react";

interface AIInsightProps {
  action: string;
  asset?: string;
  direction?: boolean;
  amount?: string;
  principal?: string;
  yieldAmount?: string;
  positions?: number;
  trigger: number; // increment to re-trigger
}

export default function AIInsight({
  action, asset, direction, amount, principal, yieldAmount, positions, trigger,
}: AIInsightProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (trigger <= 0) return;
    fetchSuggestion();
  }, [trigger]);

  const fetchSuggestion = async () => {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    setVisible(true);

    try {
      const res = await fetch("http://localhost:3001/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, asset, direction, amount, principal, yieldAmount, positions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get AI suggestion");
      setSuggestion(data.suggestion);
    } catch (e: any) {
      setError(e.message || "AI suggestion unavailable");
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="ai-insight-card p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-orange/30 to-accent-cyan/20 flex items-center justify-center text-lg shrink-0">
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs font-semibold text-accent-amber uppercase tracking-wider">AI Insight</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-orange/10 text-accent-orange border border-accent-orange/20">
              ChainGPT
            </span>
          </div>

          {loading && (
            <div className="flex items-center gap-2 py-2">
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              <span className="text-sm text-slate-400">ChainGPT is analyzing your action...</span>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {suggestion && (
            <p className="text-sm text-slate-300 leading-relaxed">{suggestion}</p>
          )}
        </div>

        <button
          onClick={() => setVisible(false)}
          className="text-slate-500 hover:text-slate-300 transition-colors text-lg shrink-0"
        >
          ×
        </button>
      </div>
    </div>
  );
}
