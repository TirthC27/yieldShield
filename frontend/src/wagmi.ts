import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { arbitrumSepolia } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "YieldShield",
  projectId: "b1e8e16e5c604c8e9f0f9e8c7d6a5b4c", // Get yours at cloud.walletconnect.com
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http("https://sepolia-rollup.arbitrum.io/rpc"),
  },
});
