import { createConfig, http } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";
import { injected, walletConnect, coinbaseWallet } from "wagmi/connectors";

// Use env var if set, otherwise fall back to the public Arbitrum Sepolia RPC
const rpcUrl =
  import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC ||
  "https://sepolia-rollup.arbitrum.io/rpc";

if (!import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC) {
  console.warn(
    "[YieldShield] VITE_ARBITRUM_SEPOLIA_RPC not set — using public fallback RPC."
  );
}

const PROJECT_ID = "b1e8e16e5c604c8e9f0f9e8c7d6a5b4c";

// Use wagmi native connectors — avoids @metamask/sdk which breaks in Vite browser builds
// injected() speaks to window.ethereum directly (MetaMask, Rabby, Brave, etc.)
// walletConnect() covers mobile wallets
export const config = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    injected(),                                     // MetaMask, Rabby, Brave, any injected
    walletConnect({ projectId: PROJECT_ID }),        // WalletConnect v2 (mobile)
    coinbaseWallet({ appName: "YieldShield" }),     // Coinbase Wallet
  ],
  transports: {
    [arbitrumSepolia.id]: http(rpcUrl),
  },
});
