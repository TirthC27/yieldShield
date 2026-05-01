import { useState, useEffect, useRef, useCallback } from "react";

interface AIAdvisorPanelProps {
  context: string;
  amount?: string;
  asset?: string;
  direction?: boolean;
  principal?: string;
  yieldAmount?: string;
  debounceMs?: number;
}

/**
 * Proactive AI advisor that shows as a floating side-panel.
 * Fires automatically when user is typing amounts or browsing pages.
 * Uses debounce to avoid hammering the API on every keystroke.
 */
export default function AIAdvisorPanel({
  context, amount, asset, direction, principal, yieldAmount, debounceMs = 1500,
}: AIAdvisorPanelProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef("");

  const fetchSuggestion = useCallback(async () => {
    const queryKey = `${context}:${amount}:${asset}:${direction}`;
    if (queryKey === lastQueryRef.current) return;
    lastQueryRef.current = queryKey;

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/proactive-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, amount, asset, direction, principal, yieldAmount }),
      });
      const data = await res.json();
      if (res.ok && data.suggestion) {
        setSuggestion(data.suggestion);
      }
    } catch {
      // Silently fail — proactive tips are optional
    } finally {
      setLoading(false);
    }
  }, [context, amount, asset, direction, principal, yieldAmount]);

  // Debounced trigger
  useEffect(() => {
    // Don't fire for empty or short amounts
    if (context === "deposit_typing" && (!amount || Number(amount) <= 0)) {
      setSuggestion(null);
      return;
    }
    if (context === "position_preview" && (!amount || Number(amount) <= 0)) {
      setSuggestion(null);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchSuggestion();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [context, amount, asset, direction, fetchSuggestion, debounceMs]);

  // Auto-fire for position_page context (once)
  useEffect(() => {
    if (context === "position_page") {
      fetchSuggestion();
    }
  }, [context]);

  if (!suggestion && !loading) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-accent-orange to-accent-amber text-black flex items-center justify-center text-xl shadow-lg shadow-accent-orange/30 hover:scale-110 transition-transform"
        title="Show AI Advisor"
      >
        🤖
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 max-h-[400px] animate-slide-up">
      <div className="ai-insight-card p-4 shadow-2xl shadow-accent-orange/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent-orange/40 to-accent-cyan/20 flex items-center justify-center text-sm">
              🤖
            </div>
            <div>
              <p className="text-xs font-bold text-accent-amber">AI ADVISOR</p>
              <p className="text-[10px] text-slate-500">ChainGPT · Live</p>
            </div>
          </div>
          <button
            onClick={() => setMinimized(true)}
            className="text-slate-500 hover:text-slate-300 transition-colors text-sm px-1"
          >
            ▬
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center gap-2 py-3">
            <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            <span className="text-xs text-slate-400">Analyzing...</span>
          </div>
        ) : suggestion ? (
          <div className="text-sm text-slate-300 leading-relaxed max-h-[280px] overflow-y-auto">
            {suggestion.split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={i} className="h-1.5" />;
              if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
                return (
                  <p key={i} className="flex gap-1.5 mb-1 text-xs">
                    <span className="text-accent-orange shrink-0">▸</span>
                    <span>{trimmed.replace(/^[•-]\s*/, "")}</span>
                  </p>
                );
              }
              return <p key={i} className="text-xs mb-1">{trimmed}</p>;
            })}
          </div>
        ) : null}

        {/* Branding */}
        <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between">
          <span className="text-[9px] text-slate-600">Powered by ChainGPT</span>
          <button
            onClick={() => { lastQueryRef.current = ""; fetchSuggestion(); }}
            className="text-[10px] text-accent-orange hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
