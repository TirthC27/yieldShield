# iExec Tools Feedback — YOLDR Team

> Required submission artifact for the iExec Vibe Coding Challenge 2026

---

## 1. Nox Protocol — Core SDK

### What Worked Well ✅

- **Encrypted type system is intuitive** — `euint256` / `ebool` felt natural once we understood the handle model
- **`Nox.allowThis()` / `Nox.allowTransient()`** — clean permission model for cross-contract composability
- **Arithmetic operators** — `Nox.add()`, `Nox.sub()`, `Nox.mul()`, `Nox.div()`, `Nox.eq()`, `Nox.lt()` covered all our needs
- **JS SDK gasless decryption** — EIP-712 signature-based `handleClient.decrypt()` is excellent UX. No gas, no broadcast

### Pain Points ⚠️

- **Opaque error messages** — `"Handle access denied"` without indicating which contract in the call chain failed. Cost us hours of debugging.
- **`euint256` view functions underdocumented** — It wasn't clear that view functions return the encrypted handle, not plaintext. Needs a clear upfront note.
- **No hardhat-nox plugin for local testing** — Every test required deploying to Arbitrum Sepolia testnet. A local stub for the Handle Gateway + KMS would be the single biggest DX improvement.
- **Handle Gateway rate limiting** — Silent failures during intensive testing sessions. Needs clearer rate limit docs and SDK-level error propagation.

---

## 2. Confidential Token (ERC-7984)

### What Worked Well ✅

- **Wrapper concept is brilliant** — Wrapping any ERC-20 into a confidential version without touching existing contracts is perfect for DeFi adoption
- **`setOperator()` vs `approve()`** — Time-bound operator permissions are strictly safer and should be highlighted more prominently
- **Full composability maintained** — The wrapped token works in standard DeFi contexts unchanged

### Pain Points ⚠️

- **Evolving spec** — Found discrepancies between npm package and spec doc for encrypted `transfer()` edge cases. Versioned docs would help.
- **Wrap/unwrap gas costs undocumented** — Higher than expected. Gas benchmarks vs standard ERC-20 needed.

---

## 3. Developer Documentation

### What Worked Well ✅

- Getting Started guide is a good entry point
- `cdefi-wizard.iex.ec` boilerplate generator is useful
- `cdefi.iex.ec` demo gave us a working reference

### Suggestions ⚠️

- **Add end-to-end "Confidential Vault" tutorial** — deposit → encrypt → yield → ERC-7540 withdraw. Would have saved 2-3 days.
- **More React frontend examples** — Loading encrypted balances in a component, handling stale handles, error states.
- **FAQ on common mistakes:**
  - "Handle returns zero?" → Contract missing `allowThis()`
  - "Decryption fails?" → Handle from wrong contract/network
  - "Can I store handles in events?" → No (events are public)

---

## 4. ChainGPT Integration

### What Worked Well ✅

- **`/chat/stream` endpoint** — Versatile, `chatHistory: "off"` works perfectly for stateless queries
- **Real market data** — Model had live BTC/ETH prices, making market outlook features genuinely useful
- **Smart contract auditing quality** — Detailed, severity-categorized output with specific recommendations

### Pain Points ⚠️

- **Initial 404 errors** — Endpoint (`/chat/stream`) and request body format (`question` field, not OpenAI-style `messages` array) should be clearer in docs upfront
- **Response times 15-30s** — Too slow for real-time UI. Token streaming to frontend would dramatically improve UX
- **No Web3 system prompt option** — A built-in DeFi expert mode would reduce prompt engineering overhead

---

## 5. Overall Ratings

| Category | Rating | Notes |
|---|---|---|
| Nox Protocol Concept | ⭐⭐⭐⭐⭐ | Genuinely novel and useful for DeFi |
| Nox JS SDK | ⭐⭐⭐⭐ | Works well, needs more frontend examples |
| Nox Documentation | ⭐⭐⭐ | Good start, needs end-to-end tutorials |
| Local Dev Experience | ⭐⭐ | Testnet-only workflow is slow |
| ERC-7984 | ⭐⭐⭐⭐ | Clean design, minor spec gaps |
| ChainGPT API Quality | ⭐⭐⭐⭐ | Excellent output, docs need improvement |
| ChainGPT Speed | ⭐⭐⭐ | Needs streaming UI support |
| Overall Hackathon DX | ⭐⭐⭐⭐ | Would build on Nox again |

### What Excited Us Most

The ability to have **on-chain computation on encrypted data** without ZK proof delays is genuinely novel. For DeFi this means MEV protection, strategy privacy, and regulatory compliance — all without protocol-level changes to existing infrastructure. The Nox + ERC-7984 + ERC-7540 combination we implemented represents a genuinely new primitive.

---

*Submitted by the YOLDR team — iExec Vibe Coding Challenge 2026*
