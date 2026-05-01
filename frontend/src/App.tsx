import { useState } from "react";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import Vault from "./components/Vault";
import Positions from "./components/Positions";
import Badges from "./components/Badges";
import Privacy from "./components/Privacy";

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "vault", label: "Vault", icon: "🏦" },
  { id: "positions", label: "Positions", icon: "📈" },
  { id: "badges", label: "Badges", icon: "🏅" },
  { id: "privacy", label: "Privacy", icon: "🔐" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function App() {
  const [tab, setTab] = useState<TabId>("dashboard");

  return (
    <div className="min-h-screen bg-navy-950">
      <Header />

      {/* Tab navigation */}
      <nav className="sticky top-16 z-30 backdrop-blur-xl bg-navy-950/80 border-b border-accent-orange/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto scrollbar-hide">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-all border-b-2 ${
                tab === t.id
                  ? "border-accent-orange text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600"
              }`}
            >
              <span className="text-base">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Page content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {tab === "dashboard" && <Dashboard />}
        {tab === "vault" && <Vault />}
        {tab === "positions" && <Positions />}
        {tab === "badges" && <Badges />}
        {tab === "privacy" && <Privacy />}
      </main>

      {/* Footer */}
      <footer className="border-t border-accent-orange/10 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="font-semibold text-sm text-gradient-orange">YOLDR — Privacy-first DeFi</p>
              <p className="text-xs text-slate-600 mt-1">Deployed on Arbitrum Sepolia Testnet</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-accent-orange transition-colors">GitHub</a>
              <span className="text-slate-700">·</span>
              <a href="https://docs.iex.ec/nox-protocol/getting-started/welcome" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-accent-orange transition-colors">iExec Nox Docs</a>
              <span className="text-slate-700">·</span>
              <a href="https://chaingpt.org" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-accent-orange transition-colors">ChainGPT</a>
            </div>
          </div>
          <p className="text-center text-[10px] text-slate-700 mt-4">Built for iExec Vibe Coding Challenge Hackathon</p>
        </div>
      </footer>
    </div>
  );
}
