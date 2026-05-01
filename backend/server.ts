import express from "express";
import cors from "cors";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"] }));
app.use(express.json());

const CHAINGPT_API_KEY = process.env.CHAINGPT_API_KEY;
const CHAINGPT_BASE = "https://api.chaingpt.org";

// Read the vault contract source once at startup
const vaultPath = path.join(__dirname, "..", "contracts", "YieldShieldVault.sol");
const vaultSource = fs.existsSync(vaultPath) ? fs.readFileSync(vaultPath, "utf-8") : "// Contract not found";

/**
 * Helper: call ChainGPT /chat/stream endpoint (buffered mode).
 * The single endpoint handles both streaming and buffered responses.
 */
async function callChainGPT(prompt: string): Promise<string> {
  if (!CHAINGPT_API_KEY) throw new Error("CHAINGPT_API_KEY not configured");

  const response = await fetch(`${CHAINGPT_BASE}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHAINGPT_API_KEY}`,
    },
    body: JSON.stringify({
      model: "general_assistant",
      question: prompt,
      chatHistory: "off",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("ChainGPT error:", response.status, errText);
    throw new Error(`ChainGPT API error: ${response.status} — ${errText}`);
  }

  // ChainGPT may return streamed text or JSON — handle both
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    return data?.data?.bot || data?.bot || data?.choices?.[0]?.message?.content || data?.message || text;
  } catch {
    // Response was plain text (streamed), return as-is
    return text;
  }
}

// ─── Audit endpoint ───────────────────────────────────────────────
app.post("/api/audit", async (_req, res) => {
  const prompt = `You are a smart contract security auditor. Audit the following Solidity contract for security vulnerabilities, focusing on: reentrancy attacks, integer overflow, access control issues, and MEV vulnerabilities. For each finding state: severity (LOW/MEDIUM/HIGH), description, and recommendation. Start your response with an overall risk level: LOW, MEDIUM, or HIGH. Then list findings as numbered items. Contract code:\n\n${vaultSource}`;

  try {
    const content = await callChainGPT(prompt);
    return res.json({ audit: content });
  } catch (err: any) {
    console.error("Audit error:", err.message);
    return res.status(500).json({ error: err.message || "Failed to contact ChainGPT" });
  }
});

// ─── AI Suggestion endpoint (called after key actions) ────────────
app.post("/api/suggest", async (req, res) => {
  const { action, asset, direction, amount, principal, yieldAmount, positions } = req.body;

  let prompt = "";

  switch (action) {
    case "deposit":
      prompt = `You are a DeFi yield strategy advisor. A user just deposited ${amount} YST tokens into a principal-protected vault earning 0.0001% per block (~0.72%/day). Their total principal is now ${principal} YST. Give a brief, actionable suggestion (2-3 sentences) about what they should do next — e.g., optimal position sizing, diversification, or waiting for yield to accumulate. Be specific with numbers. End with a risk note.`;
      break;

    case "withdraw":
      prompt = `You are a DeFi advisor. A user just withdrew ${amount} YST from their vault. Their remaining principal is ${principal} YST with ${yieldAmount} YST accrued yield. Give a brief suggestion (2-3 sentences) about rebalancing their position or re-depositing. Be practical and specific.`;
      break;

    case "open_position":
      prompt = `You are a crypto trading advisor for a DeFi protocol. A user just opened a ${direction ? "LONG" : "SHORT"} position on ${asset} using ${amount} YST of their yield at 3x leverage. They have ${positions || 0} other active positions. Give a brief risk assessment and suggestion (2-3 sentences). Consider correlation risk if they have multiple positions. Mention potential take-profit or stop strategies. Keep it actionable.`;
      break;

    case "close_position":
      prompt = `You are a DeFi trading advisor. A user just closed a position on ${asset}. They have ${yieldAmount} YST in remaining yield and ${positions || 0} other active positions. Suggest what they should do next — reinvest, diversify, or wait? Keep it to 2-3 sentences with specific reasoning.`;
      break;

    case "collect_yield":
      prompt = `You are a DeFi yield optimizer. A user just collected ${amount} YST in yield from their vault. Their principal remains ${principal} YST and continues earning. Suggest the best use for this yield — trade it, re-deposit for compounding, or diversify? Be specific in 2-3 sentences.`;
      break;

    default:
      prompt = `You are a DeFi advisor. A user is using a principal-protected yield vault. They have ${principal || "unknown"} YST deposited and ${yieldAmount || "unknown"} YST in yield. Give a brief general strategy suggestion in 2-3 sentences.`;
  }

  try {
    const content = await callChainGPT(prompt);
    return res.json({ suggestion: content });
  } catch (err: any) {
    console.error("Suggest error:", err.message);
    return res.status(500).json({ error: err.message || "Failed to get suggestion" });
  }
});

// ─── Proactive AI Suggestion (real-time tips while user interacts) ─
app.post("/api/proactive-suggest", async (req, res) => {
  const { context, amount, asset, principal, yieldAmount } = req.body;

  let prompt = "";

  switch (context) {
    case "deposit_typing":
      prompt = `You are a DeFi yield advisor. A user is considering depositing ${amount} YST into a principal-protected vault earning 0.0001% per block (~0.72%/day). Their current principal is ${principal || 0} YST. In exactly 2 sentences: tell them what daily and monthly yield they'd earn with this deposit, and give one actionable tip. Be concise and specific with numbers.`;
      break;

    case "position_page":
      prompt = `You are a crypto market strategist. A user has ${yieldAmount || "some"} YST of accrued yield available to trade. They can open 3x leveraged positions on BTC, ETH, or GOLD. In exactly 3 short bullet points (use • symbol), give a brief market outlook for each asset and whether to go LONG or SHORT right now. Keep each bullet to 1 sentence max. Be decisive.`;
      break;

    case "position_preview":
      prompt = `You are a risk advisor. A user wants to open a 3x leveraged ${req.body.direction ? "LONG" : "SHORT"} position on ${asset} using ${amount} YST. Their remaining yield after this trade would be ${yieldAmount || "unknown"} YST. In 1-2 sentences: assess if this position size is appropriate and give a quick risk/reward take. Be brief and actionable.`;
      break;

    default:
      prompt = `You are a DeFi advisor. Give a one-sentence market tip for a yield vault user with ${principal || "unknown"} YST deposited.`;
  }

  try {
    const content = await callChainGPT(prompt);
    return res.json({ suggestion: content });
  } catch (err: any) {
    console.error("Proactive suggest error:", err.message);
    return res.status(500).json({ error: err.message || "AI unavailable" });
  }
});

// ─── Faucet: Mint test YST tokens ────────────────────────────────
app.post("/api/faucet", async (req, res) => {
  const { to, amount } = req.body;

  if (!to || !amount) {
    return res.status(400).json({ error: "Missing 'to' address or 'amount'" });
  }

  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc";
  const YST_ADDRESS = "0xcA7c26779B4eEF9107515fFd04a58d35b9f01707";

  if (!PRIVATE_KEY) {
    return res.status(500).json({ error: "PRIVATE_KEY not configured on server" });
  }

  try {
    // Use raw RPC calls to avoid extra dependencies
    // 1. Build mint(address,uint256) calldata
    const mintSelector = "0x40c10f19"; // keccak256("mint(address,uint256)") first 4 bytes
    const toAddr = to.toLowerCase().replace("0x", "").padStart(64, "0");
    // amount is in ether units, convert to wei (18 decimals)
    const weiAmount = BigInt(Math.floor(Number(amount) * 1e18));
    const amountHex = weiAmount.toString(16).padStart(64, "0");
    const calldata = mintSelector + toAddr + amountHex;

    // 2. Use ethers-style raw tx via the private key
    // Import ethers dynamically
    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const tx = await wallet.sendTransaction({
      to: YST_ADDRESS,
      data: calldata,
      gasLimit: 100000n,
    });

    console.log(`🪙 Faucet: Minting ${amount} YST to ${to} — tx: ${tx.hash}`);
    await tx.wait();

    return res.json({ success: true, txHash: tx.hash, amount });
  } catch (err: any) {
    console.error("Faucet error:", err.message);
    return res.status(500).json({ error: err.message || "Mint failed" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🔐 YieldShield Audit API running on http://localhost:${PORT}`);
  console.log(`   ChainGPT key: ${CHAINGPT_API_KEY ? "✅ configured" : "❌ missing"}`);
  console.log(`   Faucet key: ${process.env.PRIVATE_KEY ? "✅ configured" : "❌ missing"}`);
});
