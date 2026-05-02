import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";

// Use env var if set, otherwise fall back to the public Arbitrum Sepolia RPC
const rpcUrl =
  import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC ||
  "https://sepolia-rollup.arbitrum.io/rpc";

if (!import.meta.env.VITE_ARBITRUM_SEPOLIA_RPC) {
  console.warn(
    "[YieldShield] VITE_ARBITRUM_SEPOLIA_RPC not set — using public fallback RPC. " +
    "Set this in your Vercel/Netlify environment variables for production."
  );
}

export const config = getDefaultConfig({
  appName: "YieldShield",
  projectId: "b1e8e16e5c604c8e9f0f9e8c7d6a5b4c", // Get yours at cloud.walletconnect.com
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(rpcUrl),
  },
});
