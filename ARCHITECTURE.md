# YieldShield Architecture

## System Overview

YieldShield is a multi-contract DeFi system with a React frontend, Express backend for AI audit, and planned iExec Nox confidential computing integration.

## Smart Contract Interaction Flow

```
                    ┌─────────────────────────────────┐
                    │         USER WALLET              │
                    │    (MetaMask / RainbowKit)       │
                    └──────┬──────────────┬────────────┘
                           │              │
                    approve(vault)   deposit/withdraw
                           │              │
                    ┌──────▼──────┐       │
                    │  MockERC20  │       │
                    │    (YST)    │       │
                    └──────┬──────┘       │
                           │              │
                    transferFrom          │
                           │              │
                    ┌──────▼──────────────▼────────────┐
                    │       YieldShieldVault            │
                    │                                   │
                    │  • Stores principal per user      │
                    │  • Accrues yield per block         │
                    │  • Async withdrawal (2 blocks)    │
                    │  • Triggers Guardian evolution     │
                    └──────┬──────────────┬────────────┘
                           │              │
                   collectYield    evolveByVault
                           │              │
              ┌────────────▼────┐   ┌─────▼───────────┐
              │ PositionManager │   │  GuardianNFT     │
              │                 │   │                   │
              │ • Opens 3× pos  │   │ • 1 per wallet   │
              │ • Closes + P&L  │   │ • Levels 1-5     │
              │ • Tracks claims │   │ • Auto-evolves    │
              └────────┬────────┘   └──────────────────┘
                       │
                  mintBadge
                       │
              ┌────────▼────────┐
              │    BadgeNFT     │
              │                 │
              │ • Trade history │
              │ • Win/Loss data │
              │ • On-chain meta │
              └─────────────────┘
```

## Confidential Token Protection (iExec Nox)

```
┌─────────────────────────────────────────────────────────────┐
│                  WITHOUT NOX (Current MVP)                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  On-Chain (PUBLIC):                                         │
│  ┌──────────────────────────────────────────────────┐       │
│  │ principal[alice] = 10000 YST    ← VISIBLE        │       │
│  │ accruedYield[alice] = 5.2 YST   ← VISIBLE        │       │
│  │ position: BTC LONG 3× 5 YST    ← VISIBLE         │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  MEV Bot: "Alice has 10K deposited, going LONG BTC,         │
│            let me front-run her position!"                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  WITH NOX (Production)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  On-Chain (ENCRYPTED):                                      │
│  ┌──────────────────────────────────────────────────┐       │
│  │ principal[alice] = 0x8f3a...  ← ENCRYPTED         │       │
│  │ accruedYield[alice] = 0x2b7c... ← ENCRYPTED       │       │
│  │ position: 0x9d4e... 0xf1a3... ← ENCRYPTED         │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  TEE Enclave (PRIVATE):                                     │
│  ┌──────────────────────────────────────────────────┐       │
│  │ Decrypt → Compute yield → Re-encrypt → Store      │       │
│  │ Only the TEE can see plaintext values              │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  MEV Bot: "I see encrypted data... can't do anything."      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Frontend → Contract Communication

```
┌──────────────┐    wagmi hooks     ┌──────────────────┐
│   React App  │ ──────────────────▶│  Arbitrum Sepolia │
│              │                    │  RPC Endpoint     │
│  Dashboard   │  useReadContract   │                   │
│  Vault       │  useWriteContract  │  YieldShieldVault │
│  Positions   │  useBlockNumber    │  PositionManager  │
│  Badges      │  useAccount        │  GuardianNFT      │
│  Privacy     │                    │  BadgeNFT         │
│              │◀──────────────────│  MockERC20        │
│              │    event logs      │                   │
└──────────────┘                    └──────────────────┘
```

## ChainGPT Integration Flow

```
┌──────────────┐   POST /api/audit   ┌──────────────┐   API Call   ┌──────────────┐
│   Frontend   │ ──────────────────▶ │   Express    │ ──────────▶ │  ChainGPT    │
│  AuditPanel  │                     │   Backend    │              │  API         │
│              │◀────────────────── │  (port 3001) │ ◀────────── │              │
│  Displays:   │   audit results     │              │   AI audit   │  Analyzes:   │
│  • Risk lvl  │                     │  Reads .sol  │   response   │  • Reentrancy│
│  • Findings  │                     │  source code │              │  • Overflow  │
│  • Recommend │                     │              │              │  • Access    │
└──────────────┘                     └──────────────┘              │  • MEV      │
                                                                   └──────────────┘
```

## Key Design Decisions

1. **Principal isolation**: The vault strictly separates principal from yield. No function path exists to use principal for trading.
2. **Async withdrawal**: ERC-7540-inspired 2-block delay prevents flash loan attacks on the vault.
3. **Simulated yield**: MVP uses simple block-based yield (0.0001%/block) for testnet demonstration.
4. **Simulated outcome**: `block.timestamp % 2` for win/loss. Production would use an oracle.
5. **ReentrancyGuard**: All state-changing functions protected against reentrancy.
6. **SafeERC20**: All token transfers use OpenZeppelin's SafeERC20 to handle non-standard tokens.
