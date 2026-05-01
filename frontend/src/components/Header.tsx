import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

export default function Header() {
  const { chain } = useAccount();

  return (
    <>
      {/* Tech banner */}
      <div className="bg-gradient-to-r from-accent-orange/8 via-navy-950 to-accent-cyan/8 text-center py-1.5 text-xs text-slate-400 border-b border-accent-orange/10">
        🔐 Built with <span className="text-accent-purple font-semibold">iExec Nox Protocol</span> &nbsp;|&nbsp; 🤖 Powered by <span className="text-accent-orange font-semibold">ChainGPT</span>
      </div>
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-navy-950/80 border-b border-accent-orange/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent-orange to-accent-amber flex items-center justify-center shadow-lg shadow-accent-orange/20">
              <span className="text-black font-extrabold text-sm">YS</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gradient-orange leading-tight">
                YOLDR
              </h1>
              <p className="text-[10px] text-slate-500 -mt-0.5 hidden sm:block">Principal Protected</p>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {chain && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-navy-800/60 border border-accent-orange/15 text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
                {chain.name}
              </div>
            )}
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
            />
          </div>
        </div>
      </header>
    </>
  );
}
