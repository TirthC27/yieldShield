# 🛡️ YOLDR — You Only Lose the Yield, Really

> **iExec Vibe Coding Challenge 2026 Submission**  
> Built with [iExec Nox Protocol](https://docs.iex.ec/nox-protocol/getting-started/welcome) · Powered by [ChainGPT](https://chaingpt.org) · Deployed on **Arbitrum Sepolia**

---

## 🎯 The Problem We're Solving

In traditional DeFi, users face an all-or-nothing risk model: deposit your capital, expose it entirely to market volatility, and hope your strategy doesn't get liquidated. A single bad trade can wipe out months — or years — of savings. This forces users into an impossible choice: either accept near-zero yields from "safe" protocols, or risk their principal in high-yield strategies.

**The data is damning:**
- Over $2.8B was lost to DeFi liquidations in 2023 alone
- 60%+ of new DeFi users abandon protocols after their first significant loss
- MEV bots front-run strategies visible on-chain, stealing yield from ordinary users before transactions even confirm

Additionally, **transaction privacy is non-existent** in standard DeFi. Every deposit, position size, and trade direction is publicly visible — allowing competing actors (bots, whale wallets, protocol exploiters) to front-run, copy-trade, or sandwich attack ordinary users.

---

## 💡 Our Solution: Principal-Protected Confidential DeFi

**YOLDR** (_You Only Lose the Yield, Really_) is a **principal-protected DeFi vault** built on **iExec Nox** that mathematically separates savings from speculation:

- **Your principal is always safe** — locked in a confidential vault, never exposed to trading risk
- **Your yield takes the risk** — only accrued yield is used as margin for leveraged positions
- **MEV bots see nothing** — position sizes and directions are encrypted on-chain using `euint256` and `ebool` types via iExec Nox
- **ChainGPT guides every action** — an AI advisor provides real-time strategy suggestions after every deposit, withdrawal, and trade

### How It Works

```
User Deposits YST
       ↓
Principal → Encrypted as euint256 (Nox) → Locked in Vault (SAFE)
       ↓
Yield Accrues (0.0001%/block) → Encrypted as euint256 (Nox)
       ↓
User opens Shield Position (BTC/ETH/GOLD)
  → Size encrypted as euint256
  → Direction encrypted as ebool
  → MEV bots see: nothing
       ↓
WIN: +3x yield returned   |   LOSE: only yield lost, principal safe
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     YOLDR Frontend                      │
│           (React + Vite + RainbowKit + wagmi)           │
├─────────────────┬───────────────────────────────────────┤
│   AI Advisor    │         Vault Interface                │
│   (ChainGPT)    │   Dashboard · Vault · Positions        │
└────────┬────────┴──────────────┬────────────────────────┘
         │                       │
         ▼                       ▼
┌────────────────┐    ┌──────────────────────────────────┐
│  Backend API   │    │      Arbitrum Sepolia             │
│  (Node/Express)│    ├──────────────────────────────────┤
│                │    │  YieldShieldVault.sol             │
│  /api/suggest  │    │  ┌──────────────────────────┐    │
│  /api/audit    │    │  │ principal: euint256 (Nox)│    │
│  /api/proactive│    │  │ yield:     euint256 (Nox)│    │
│  /api/faucet   │    │  └──────────────────────────┘    │
└────────┬───────┘    ├──────────────────────────────────┤
         │            │  PositionManager.sol              │
         ▼            │  ┌──────────────────────────┐    │
┌────────────────┐    │  │ size:      euint256 (Nox)│    │
│  ChainGPT API  │    │  │ direction: ebool    (Nox)│    │
│  /chat/stream  │    │  └──────────────────────────┘    │
└────────────────┘    ├──────────────────────────────────┤
                      │  GuardianNFT.sol · BadgeNFT.sol   │
                      │  MockERC20.sol (YST Token)        │
                      └──────────────────────────────────┘
```

---

## 🔐 iExec Nox Integration

### Why Nox?

Standard DeFi vaults expose everything: your balance, your position size, your trade direction. This makes you a target for MEV, front-running, and copy-trading. iExec Nox solves this with **on-chain encrypted types** processed in TEEs.

### How We Use Nox

| Feature | Nox Primitive | Where |
|---|---|---|
| Encrypted principal storage | `euint256` | `YieldShieldVault.sol` |
| Encrypted yield accumulation | `euint256` | `YieldShieldVault.sol` |
| Encrypted position size | `euint256` | `PositionManager.sol` |
| Encrypted trade direction | `ebool` | `PositionManager.sol` |
| Confidential withdrawal amount | `euint256` handle + proof | ERC-7540 flow |
| Client-side decryption | `handleClient.decrypt()` | Frontend (Nox JS SDK) |

### The Encryption Flow

```solidity
// In YieldShieldVault.sol
function deposit(uint256 amount) external {
    // Convert plaintext deposit to encrypted handle
    euint256 encAmount = Nox.toEuint256(amount);
    
    // Grant the vault contract access to this handle
    Nox.allowThis(encAmount);
    
    // Store encrypted — no observer can read the balance
    encryptedPrincipal[msg.sender] = Nox.add(
        encryptedPrincipal[msg.sender], encAmount
    );
}
```

```typescript
// In Frontend (Nox JS SDK)
// Gasless EIP-712 signature-based decryption
const result = await handleClient.decrypt(encHandle);
// Plaintext never leaves the user's browser
```

### ERC-7984: Confidential Token Standard

The `ConfidentialYST` contract wraps the `YST` ERC-20 into a fully confidential token using the ERC-7984 standard — the first product built on Nox. This enables:
- **Hidden balances** — no one knows your token holdings
- **Confidential transfers** — amounts hidden from observers
- **Time-bound operator permissions** — replaces traditional allowances with expiring grants
- **Full composability** — works with existing DeFi protocols unchanged

### ERC-7540: Async Withdrawal

Withdrawals follow the ERC-7540 asynchronous redemption standard:
1. User submits encrypted withdrawal request (amount hidden)
2. 2-block delay enforced (MEV protection)
3. Execution completes the withdrawal with Nox-verified amounts

---

## 🤖 ChainGPT Integration

YOLDR deeply integrates ChainGPT at every user touchpoint:

### 1. Smart Contract Security Audit
- **Endpoint**: `POST /api/audit`
- Auto-audits `YieldShieldVault.sol` for reentrancy, overflow, access control, and MEV vulnerabilities
- Returns structured findings with severity levels (LOW/MEDIUM/HIGH)

### 2. Post-Action AI Suggestions
- **Endpoint**: `POST /api/suggest`
- Fires after every key action: deposit, withdraw, open position, close position, collect yield
- Provides specific DeFi strategy advice based on the user's current portfolio state

### 3. Proactive Real-Time Advisor
- **Endpoint**: `POST /api/proactive-suggest`
- **On Vault page**: Appears as a floating panel with debounce as user types deposit amounts — tells them exact daily/monthly yield projections
- **On Positions page**: Auto-fires with real-time BTC/ETH/GOLD market outlook and LONG/SHORT recommendations using live ChainGPT market data
- **On Position preview**: Risk assessment for specific trade sizing

### ChainGPT API Usage

```typescript
// We use ChainGPT's /chat/stream endpoint
const response = await fetch("https://api.chaingpt.org/chat/stream", {
  method: "POST",
  headers: { Authorization: `Bearer ${CHAINGPT_API_KEY}` },
  body: JSON.stringify({
    model: "general_assistant",
    question: prompt,  // Context-aware DeFi prompt
    chatHistory: "off",
  }),
});
```

---

## 🎮 Features

### Principal Protection
- Deposit YST tokens → principal encrypted as `euint256` via Nox
- Principal **cannot** be used for trading — only the accrued yield can
- Withdraw at any time via the ERC-7540 async flow

### Shield Positions (Leveraged Trading)
- Trade BTC, ETH, or GOLD with **3x leverage** using only your yield
- Position size and direction encrypted on-chain — MEV bots see nothing
- Win: +3x your yield bet returned. Lose: only the yield, not the principal

### Guardian NFT System
- Each vault is paired with a Guardian NFT that evolves as you interact
- 5 levels: Iron → Sapphire → Amethyst → Gold → Prismatic
- Visual progression that rewards long-term participation

### Battle Badges
- Every closed position mints a Badge NFT recording the trade result permanently
- Win/loss history, asset, amount, and timestamp stored on-chain
- Leaderboard-ready data for community competition

### YST Token Faucet
- Built-in faucet lets users mint test YST tokens directly in the UI
- Deployed on Arbitrum Sepolia for easy testnet access

---

## 📦 Deployed Contracts (Arbitrum Sepolia)

| Contract | Address |
|---|---|
| `YST Token (MockERC20)` | `0xcA7c26779B4eEF9107515fFd04a58d35b9f01707` |
| `ConfidentialYST (ERC-7984)` | `0xA13d3FF0E78C98fa552aFC017Ef5d9A5d5b50487` |
| `YieldShieldVault` | `0x871d271FeaDC34fBd91fB176C21Cf15722f824CF` |
| `PositionManager` | `0xDD0508567d99258b51Ab41d1781984F6868836a5` |
| `GuardianNFT` | `0x0FCe266EE0D8eBd96aea9b320d548B739A25ac72` |
| `BadgeNFT` | `0x1b312168795710c4fA1A4F0226F8bCD037aFEa20` |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MetaMask or any EVM-compatible wallet
- Arbitrum Sepolia testnet ETH (for gas) — get from [Alchemy Faucet](https://www.alchemy.com/faucets/arbitrum-sepolia)

### 1. Clone the Repository

```bash
git clone https://github.com/TirthC27/yieldShield.git
cd yieldShield
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
PRIVATE_KEY=your_deployer_private_key_here
CHAINGPT_API_KEY=your_chaingpt_api_key_here
ARBITRUM_SEPOLIA_RPC=https://sepolia-rollup.arbitrum.io/rpc
```

> **Get ChainGPT API Credits:** Contact [@vladnazarxyz](https://t.me/vladnazarxyz) on Telegram for free hackathon credits.

### 3. Install Dependencies

```bash
# Root (Hardhat / contracts)
npm install

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend && npm install && cd ..
```

### 4. Run Locally

**Terminal 1 — Backend AI API:**
```bash
cd backend
npm run dev
# → Backend running at http://localhost:3001
# → ChainGPT: ✅ configured
# → Faucet: ✅ configured
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# → App running at http://localhost:5173
```

### 5. Using the App

1. **Connect Wallet** — Use MetaMask, switch to Arbitrum Sepolia (Chain ID: 421614)
2. **Get Test Tokens** — Click "🪙 Mint YST Tokens" on the Dashboard or Vault page to get free test YST
3. **Deposit** — Approve and deposit YST tokens. Your balance is encrypted by Nox the moment it hits the vault
4. **Watch Yield Accrue** — See your live yield estimate update every block (0.0001%/block ≈ 0.72%/day)
5. **Decrypt Balances** — Click "🔓 Decrypt Exact Balances" to use the Nox JS SDK to reveal your exact encrypted balance
6. **Open a Position** — Go to Positions tab, select BTC/ETH/GOLD, pick LONG or SHORT, enter yield amount (hit MAX to use all available yield). Your position is encrypted immediately
7. **Get AI Advice** — ChainGPT's AI Advisor panel appears automatically with market insights as you interact

---

## 🔧 Deploying Your Own Contracts

```bash
# Compile contracts
npx hardhat compile

# Deploy to Arbitrum Sepolia
npx hardhat run scripts/deploy.ts --network arbitrumSepolia

# Copy ABIs to frontend
node scripts/copyAbis.js
```

Update contract addresses in `frontend/src/config/contracts.ts` after deployment.

---

## 🏗️ Production Build

```bash
cd frontend
npm run build
# Output in frontend/dist/ — ready to deploy to Vercel/Netlify/IPFS
```

---

## 📁 Project Structure

```
yoldr/
├── contracts/                   # Solidity smart contracts
│   ├── YieldShieldVault.sol     # Principal-protected vault (ERC-7540 + Nox euint256)
│   ├── PositionManager.sol      # Leveraged positions (Nox euint256 + ebool)
│   ├── ConfidentialYST.sol      # ERC-7984 Confidential Token wrapper
│   ├── GuardianNFT.sol          # Evolving guardian NFT
│   ├── BadgeNFT.sol             # Trade badge NFT
│   └── MockERC20.sol            # Test YST token
├── backend/
│   └── server.ts                # Express API: ChainGPT + Faucet endpoints
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Dashboard.tsx    # Main vault dashboard + stats
│       │   ├── Vault.tsx        # Deposit / withdraw UI (ERC-7540)
│       │   ├── Positions.tsx    # Open/close leveraged positions
│       │   ├── Badges.tsx       # NFT badge gallery
│       │   ├── Privacy.tsx      # Nox privacy explainer + AI audit
│       │   ├── AIInsight.tsx    # Post-action ChainGPT suggestions
│       │   ├── AIAdvisorPanel.tsx # Real-time floating AI advisor
│       │   ├── MintYSTButton.tsx  # Token faucet UI
│       │   ├── Header.tsx
│       │   ├── GuardianCard.tsx
│       │   └── AuditPanel.tsx
│       ├── config/contracts.ts  # Contract addresses + ABIs
│       ├── hooks/useNoxSDK.ts   # Nox JS SDK wrapper
│       └── context/ToastContext.tsx
├── scripts/                     # Deployment + utility scripts
├── test/                        # Hardhat tests
├── .env.example                 # Environment template
├── feedback.md                  # iExec tools feedback (required)
└── ARCHITECTURE.md              # Deep technical architecture docs
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Blockchain** | Arbitrum Sepolia (EVM) |
| **Privacy Layer** | iExec Nox Protocol (`euint256`, `ebool`, TEE) |
| **Confidential Token** | ERC-7984 via `ConfidentialYST` wrapper |
| **Smart Contracts** | Solidity 0.8.28 + Hardhat |
| **Vault Standard** | ERC-7540 (Async Redemption) |
| **Frontend** | React 18 + Vite + TypeScript |
| **Web3 Frontend** | wagmi v2 + viem + RainbowKit |
| **Styling** | Tailwind CSS (dark navy + orange/amber theme) |
| **Backend** | Node.js + Express + TypeScript (tsx) |
| **AI Layer** | ChainGPT `/chat/stream` API |
| **Charts** | Recharts |

---

## 🔑 API Endpoints (Backend)

| Endpoint | Method | Description |
|---|---|---|
| `GET /health` | GET | Health check |
| `POST /api/audit` | POST | ChainGPT smart contract security audit |
| `POST /api/suggest` | POST | Post-action AI strategy suggestion |
| `POST /api/proactive-suggest` | POST | Real-time proactive AI advisor |
| `POST /api/faucet` | POST | Mint test YST tokens to any wallet |

---

## 🔐 Privacy Guarantees

| What | How Private | Mechanism |
|---|---|---|
| Your principal balance | ✅ Fully private | `euint256` — only you can decrypt |
| Your accrued yield | ✅ Fully private | `euint256` — live estimate from public blocks |
| Your position size | ✅ Fully private | `euint256` — encrypted at contract entry |
| Your trade direction | ✅ Fully private | `ebool` — L/S hidden from all observers |
| Your withdrawal amount | ✅ Fully private | Encrypted handle passed to contract |
| That you have a position | ⚠️ Partially visible | Position ID exists on-chain (not amount/direction) |

---

## 🤝 Acknowledgements

- **iExec** — for the Nox confidential computing layer and ERC-7984 standard
- **ChainGPT** — for AI infrastructure, smart contract auditing, and market insights
- **TUM Blockchain** — community partner
- **Arbitrum** — L2 infrastructure enabling fast, cheap confidential transactions

---

## 📄 License

MIT — see [LICENSE](LICENSE)

---

*Built for the [iExec Vibe Coding Challenge 2026](https://discord.gg/RXYHBJceMe) — demonstrating that confidential DeFi can protect ordinary users from the biggest risks in Web3.*
