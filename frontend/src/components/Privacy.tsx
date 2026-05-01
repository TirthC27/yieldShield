import { useState } from "react";
import AuditPanel from "./AuditPanel";

const FAQ = [
  { q: "What is Nox?", a: "Nox is iExec's confidential smart contract layer. It provides encrypted types (euint256, ebool) and a Solidity library (Nox.sol) for performing arithmetic on encrypted data. Your vault balances are stored as encrypted handles — 32-byte identifiers that point to encrypted data managed by the Handle Gateway and KMS." },
  { q: "How does Nox protect my balance?", a: "When you deposit into YieldShield, your balance is stored as euint256 (encrypted uint256) using Nox.toEuint256(). This encrypted handle is stored on-chain but is unreadable. Only you can decrypt it using the Nox JS SDK, which performs a gasless EIP-712 signature-based decryption through the Handle Gateway." },
  { q: "What is ERC-7984?", a: "ERC-7984 is the Confidential Token standard built on Nox. YieldShield wraps your plain YST tokens into cYST (Confidential YST) using the ERC20ToERC7984Wrapper. This gives you encrypted balances, confidential transfers, and time-bound operator permissions instead of traditional ERC-20 allowances." },
  { q: "Can MEV bots front-run my trades?", a: "No. Your position size is stored as euint256 and your trade direction as ebool — both encrypted. MEV bots scanning the mempool see only encrypted handles and proofs. They cannot determine your exposure, direction, or asset allocation." },
  { q: "Is my principal really safe?", a: "Yes. YieldShield enforces that only accrued yield (also stored as euint256) can be used for leveraged positions. Your principal is stored in a separate encrypted mapping and can only be withdrawn by you through the 2-block async withdrawal process with Nox handle verification." },
];

export default function Privacy() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="space-y-8 max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center space-y-3">
        <h2 className="text-3xl font-bold text-gradient-orange">
          Privacy Powered by iExec Nox
        </h2>
        <p className="text-slate-400">Your balances are encrypted. Your trades are hidden. MEV bots see nothing.</p>
      </div>

      {/* Flow diagram */}
      <div className="glass p-6 space-y-0">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">How It Works</h3>
        {[
          { step: 1, title: "You Deposit YST", desc: "Nox.toEuint256(amount) converts your deposit to an encrypted handle", icon: "📥", color: "from-accent-orange to-accent-amber" },
          { step: 2, title: "Encrypted Storage (euint256)", desc: "Balance stored as a 32-byte handle on-chain — Nox.allowThis() grants contract access", icon: "🔐", color: "from-purple-500 to-pink-500" },
          { step: 3, title: "Confidential Yield (Nox.mul/div)", desc: "Yield computed using encrypted arithmetic — Nox.mul() and Nox.div() on handles", icon: "🖥️", color: "from-accent-green to-emerald-500" },
          { step: 4, title: "Hidden Position (euint256 + ebool)", desc: "Position size stored as euint256, direction as ebool — invisible to observers", icon: "🎭", color: "from-accent-orange to-red-500" },
          { step: 5, title: "You Decrypt (JS SDK)", desc: "handleClient.decrypt(handle) — gasless EIP-712 signature, plaintext never leaves your browser", icon: "🔓", color: "from-accent-cyan to-blue-500" },
        ].map((item, i) => (
          <div key={item.step} className="flex gap-4 items-start">
            {/* Timeline */}
            <div className="flex flex-col items-center shrink-0">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-lg shadow-lg`}>
                {item.icon}
              </div>
              {i < 4 && <div className="w-0.5 h-12 bg-gradient-to-b from-slate-600 to-transparent" />}
            </div>
            {/* Content */}
            <div className="pb-8">
              <p className="text-xs text-slate-500 font-semibold">STEP {item.step}</p>
              <p className="font-bold text-white">{item.title}</p>
              <p className="text-sm text-slate-400 mt-1">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Nox architecture */}
      <div className="glass p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Nox Protocol Architecture</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-navy-800/60 rounded-xl p-4 text-center space-y-2 hover:bg-navy-700/40 transition-colors">
            <div className="text-3xl">🔗</div>
            <p className="font-semibold text-sm">On-Chain (euint256)</p>
            <p className="text-xs text-slate-400">Encrypted handles stored on Arbitrum — unreadable 32-byte identifiers</p>
          </div>
          <div className="bg-navy-800/60 rounded-xl p-4 text-center space-y-2 hover:bg-navy-700/40 transition-colors">
            <div className="text-3xl">🌐</div>
            <p className="font-semibold text-sm">Handle Gateway</p>
            <p className="text-xs text-slate-400">Manages encryption, proof generation, and EIP-712 signed verification</p>
          </div>
          <div className="bg-navy-800/60 rounded-xl p-4 text-center space-y-2 hover:bg-navy-700/40 transition-colors">
            <div className="text-3xl">🔑</div>
            <p className="font-semibold text-sm">KMS (Key Management)</p>
            <p className="text-xs text-slate-400">Secure key storage — plaintext never travels over the network</p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="glass p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Frequently Asked Questions</h3>
        {FAQ.map((item, i) => (
          <div key={i} className="border border-slate-700/50 rounded-xl overflow-hidden">
            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-navy-800/40 transition-colors">
              <span className="font-semibold text-sm">{item.q}</span>
              <span className={`text-accent-orange transition-transform ${openFaq === i ? "rotate-180" : ""}`}>▼</span>
            </button>
            {openFaq === i && (
              <div className="px-5 pb-4 text-sm text-slate-400 leading-relaxed animate-[slideIn_0.2s_ease-out]">
                {item.a}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="text-center">
        <a href="https://docs.iex.ec/nox-protocol/getting-started/welcome" target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
          📖 Read iExec Nox Docs
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
        </a>
      </div>

      {/* AI Audit */}
      <AuditPanel />
    </div>
  );
}
