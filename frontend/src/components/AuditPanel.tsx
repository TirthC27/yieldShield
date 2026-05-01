import { useState } from "react";

export default function AuditPanel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("http://localhost:3001/api/audit", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audit failed");
      setResult(data.audit);
    } catch (e: any) {
      setError(e.message || "Failed to connect to audit server");
    } finally {
      setLoading(false);
    }
  };

  const parseRisk = (text: string): "LOW" | "MEDIUM" | "HIGH" => {
    const upper = text.toUpperCase();
    if (upper.includes("HIGH RISK") || upper.startsWith("HIGH")) return "HIGH";
    if (upper.includes("MEDIUM RISK") || upper.startsWith("MEDIUM")) return "MEDIUM";
    return "LOW";
  };

  const riskColors = {
    LOW: "bg-green-500/20 text-green-400 border-green-500/40",
    MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    HIGH: "bg-red-500/20 text-red-400 border-red-500/40",
  };

  return (
    <div className="ai-insight-card p-6 space-y-5 mt-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-orange/30 to-accent-cyan/20 flex items-center justify-center">
          <span className="text-2xl">🤖</span>
        </div>
        <div>
          <h3 className="text-lg font-bold">AI Security Audit</h3>
          <p className="text-sm text-slate-400">Powered by ChainGPT — automated smart contract analysis</p>
        </div>
      </div>

      {!result && !loading && (
        <button onClick={runAudit} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
          🔍 Run AI Security Audit
        </button>
      )}

      {loading && (
        <div className="flex items-center gap-4 p-6 bg-navy-800/60 rounded-xl animate-pulse">
          <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <div>
            <p className="font-semibold text-accent-orange">ChainGPT is analyzing your vault contract...</p>
            <p className="text-xs text-slate-500 mt-1">Scanning for reentrancy, overflow, access control & MEV vulnerabilities</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 text-sm">❌ {error}</p>
          <button onClick={runAudit} className="text-xs text-accent-orange hover:underline mt-2">Retry</button>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Risk badge */}
          {(() => {
            const risk = parseRisk(result);
            return (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold ${riskColors[risk]}`}>
                {risk === "LOW" ? "✅" : risk === "MEDIUM" ? "⚠️" : "🚨"} Overall Risk: {risk}
              </div>
            );
          })()}

          {/* Audit content */}
          <div className="bg-navy-800/60 rounded-xl p-5 space-y-3 max-h-[500px] overflow-y-auto">
            {result.split("\n").map((line, i) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={i} className="h-2" />;
              if (trimmed.match(/^#{1,3}\s/) || trimmed.match(/^\*\*.*\*\*$/) || trimmed.match(/^(HIGH|MEDIUM|LOW|FINDINGS|RECOMMENDATIONS|OVERALL)/i))
                return <h4 key={i} className="font-bold text-white text-sm pt-2">{trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "")}</h4>;
              if (trimmed.startsWith("-") || trimmed.startsWith("•") || trimmed.match(/^\d+\./))
                return <p key={i} className="text-sm text-slate-300 pl-4 flex gap-2"><span className="text-accent-orange shrink-0">▸</span><span>{trimmed.replace(/^[-•]\s*/, "").replace(/^\d+\.\s*/, "")}</span></p>;
              return <p key={i} className="text-sm text-slate-400">{trimmed}</p>;
            })}
          </div>

          <button onClick={runAudit} className="btn-outline text-sm flex items-center gap-2">
            🔄 Re-run Audit
          </button>
        </div>
      )}
    </div>
  );
}
