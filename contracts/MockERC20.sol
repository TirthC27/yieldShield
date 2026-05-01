// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockERC20
 * @notice Mintable ERC-20 token used for testing the YieldShield Vault.
 *         In production this would be replaced by a real asset (e.g. USDC).
 */
contract MockERC20 is ERC20, Ownable {
    constructor(
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {}

    /**
     * @notice Mint tokens to any address. Only callable by the owner.
     * @param to   Recipient address.
     * @param amount Amount of tokens (18-decimal).
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
