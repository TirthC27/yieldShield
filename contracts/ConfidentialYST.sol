// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";
import {ERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ConfidentialYST
 * @notice ERC-7984 confidential wrapper for the YieldShield Token (YST).
 *
 * This contract implements the iExec Nox ERC-7984 standard to transform
 * the plain ERC-20 YST into a confidential token with encrypted balances
 * and private transfers.
 *
 * Flow:
 *   1. User approves this wrapper for their YST tokens
 *   2. User calls wrap(to, amount) — YST is locked, confidential cYST minted 1:1
 *   3. Balances are now encrypted on-chain — nobody can see holdings
 *   4. To unwrap: two-step process (unwrap → finalizeUnwrap with decryption proof)
 *
 * All ERC-7984 features are inherited: confidential transfers, time-bound
 * operators, receiver callbacks, and ACL-based access control on handles.
 */
contract ConfidentialYST is ERC20ToERC7984Wrapper {
    constructor(
        IERC20 _underlyingYST
    )
        ERC20ToERC7984Wrapper(_underlyingYST)
        ERC7984("Confidential YieldShield Token", "cYST", "")
    {}
}
