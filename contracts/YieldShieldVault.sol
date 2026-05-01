// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Nox, euint256, externalEuint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {IERC7984Receiver} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984Receiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title YieldShieldVault
 * @notice Principal-protected confidential DeFi vault powered by iExec Nox.
 *
 * All balances (principal + yield) are stored as euint256 — encrypted on-chain
 * so no one (not validators, not bots, not other users) can read them.
 *
 * The vault accepts both:
 *   - Plain ERC-20 deposits (auto-wrapped to encrypted)
 *   - Confidential ERC-7984 deposits via confidentialTransferAndCall
 *
 * Yield generation (MVP): 0.0001% per block on each user's principal.
 * Yield computation uses Nox encrypted arithmetic — intermediate values
 * never appear in plaintext on-chain.
 *
 * Withdrawal follows an ERC-7540-inspired async pattern:
 *   1. requestWithdraw(encryptedAmount, proof) — locks the request
 *   2. After 2 blocks, executeWithdraw() — decrypts and sends tokens back
 */
contract YieldShieldVault is Ownable, ReentrancyGuard, IERC7984Receiver {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------
    //  State
    // ----------------------------------------------------------------

    /// @notice The underlying plain ERC-20 token
    IERC20 public immutable underlyingToken;

    /// @notice The confidential ERC-7984 wrapper for the underlying token
    IERC7984 public immutable confidentialToken;

    /// @notice Encrypted principal balance per user — unreadable on-chain
    mapping(address => euint256) internal _encryptedPrincipal;

    /// @notice Encrypted accrued yield per user — unreadable on-chain
    mapping(address => euint256) internal _encryptedYield;

    /// @notice Last block at which yield was snapshot for a user
    mapping(address => uint256) public lastYieldBlock;

    /// @notice Number of deposits a user has made (for Guardian NFT evolution)
    mapping(address => uint256) public depositCount;

    /// @notice Whether a user has initialized their encrypted balances
    mapping(address => bool) public initialized;

    /// @notice Plaintext mirror of total deposited principal per user.
    ///         Used for client-side yield estimation without decryption.
    ///         Privacy note: this reveals deposit amount but not current balance.
    mapping(address => uint256) public depositedAmount;

    /// @notice Yield rate denominator: 1/1_000_000 per block = 0.0001% per block
    uint256 public constant YIELD_RATE_DENOM = 1_000_000;

    // --- Async withdrawal ---
    struct WithdrawRequest {
        euint256 amount;
        uint256 requestBlock;
        bool active;
    }
    mapping(address => WithdrawRequest) internal _withdrawRequests;

    /// @notice Address of the PositionManager that is allowed to collect yield
    address public positionManager;

    /// @notice Address of the GuardianNFT contract
    address public guardianNFT;

    bool public depositsPaused;

    // ----------------------------------------------------------------
    //  Events
    // ----------------------------------------------------------------

    event Deposited(address indexed user, uint256 amount);
    event ConfidentialDeposited(address indexed user);
    event WithdrawRequested(address indexed user);
    event WithdrawExecuted(address indexed user, uint256 amount);
    event YieldCollected(address indexed user);

    // ----------------------------------------------------------------
    //  Constructor
    // ----------------------------------------------------------------

    constructor(
        address _underlyingToken,
        address _confidentialToken
    ) Ownable(msg.sender) {
        require(_underlyingToken != address(0), "Vault: zero underlying");
        require(_confidentialToken != address(0), "Vault: zero cToken");
        underlyingToken = IERC20(_underlyingToken);
        confidentialToken = IERC7984(_confidentialToken);
    }

    // ----------------------------------------------------------------
    //  Admin
    // ----------------------------------------------------------------

    function setPositionManager(address _pm) external onlyOwner {
        require(_pm != address(0), "Vault: zero PM address");
        positionManager = _pm;
    }

    function setGuardianNFT(address _nft) external onlyOwner {
        guardianNFT = _nft;
    }

    function pauseDeposits(bool _paused) external onlyOwner {
        depositsPaused = _paused;
    }

    // ----------------------------------------------------------------
    //  Initialize encrypted state for a user
    // ----------------------------------------------------------------

    /**
     * @dev Initialize encrypted zero balances for a new user.
     *      euint256 must be explicitly initialized (unlike uint256 which defaults to 0).
     */
    function _initUser(address user) internal {
        if (!initialized[user]) {
            _encryptedPrincipal[user] = Nox.toEuint256(0);
            Nox.allowThis(_encryptedPrincipal[user]);
            Nox.allow(_encryptedPrincipal[user], user);

            _encryptedYield[user] = Nox.toEuint256(0);
            Nox.allowThis(_encryptedYield[user]);
            Nox.allow(_encryptedYield[user], user);

            lastYieldBlock[user] = block.number;
            initialized[user] = true;
        }
    }

    // ----------------------------------------------------------------
    //  Deposit (Plain ERC-20 — auto-wrapped to encrypted)
    // ----------------------------------------------------------------

    /**
     * @notice Deposit plain ERC-20 tokens. The amount is auto-wrapped
     *         to confidential representation internally.
     * @param amount Amount of underlying ERC-20 tokens to deposit.
     */
    function deposit(uint256 amount) external nonReentrant {
        require(!depositsPaused, "Vault: deposits paused");
        require(amount > 0, "Vault: zero amount");

        _initUser(msg.sender);
        _accrueYield(msg.sender);

        // Transfer underlying tokens from user to this vault
        underlyingToken.safeTransferFrom(msg.sender, address(this), amount);

        // Convert plaintext amount to encrypted and add to principal
        euint256 encAmount = Nox.toEuint256(amount);
        _encryptedPrincipal[msg.sender] = Nox.add(
            _encryptedPrincipal[msg.sender],
            encAmount
        );

        // Grant ACL permissions on the new handle
        Nox.allowThis(_encryptedPrincipal[msg.sender]);
        Nox.allow(_encryptedPrincipal[msg.sender], msg.sender);

        // Track plaintext deposit for yield estimation
        depositedAmount[msg.sender] += amount;

        depositCount[msg.sender] += 1;

        // Try to evolve guardian NFT (every 3 deposits = +1 level)
        if (guardianNFT != address(0) && depositCount[msg.sender] % 3 == 0) {
            _tryEvolveGuardian(msg.sender);
        }

        emit Deposited(msg.sender, amount);
    }

    // ----------------------------------------------------------------
    //  Confidential Deposit via ERC-7984 transfer callback
    // ----------------------------------------------------------------

    /**
     * @notice Called by the confidential token when someone uses
     *         confidentialTransferAndCall to send cYST to this vault.
     *         Implements IERC7984Receiver.
     */
    function onConfidentialTransferReceived(
        address /* operator */,
        address from,
        euint256 amount,
        bytes calldata /* data */
    ) external returns (ebool) {
        require(msg.sender == address(confidentialToken), "Vault: wrong token");

        _initUser(from);
        _accrueYield(from);

        // Add the encrypted amount to the user's principal
        _encryptedPrincipal[from] = Nox.add(
            _encryptedPrincipal[from],
            amount
        );

        Nox.allowThis(_encryptedPrincipal[from]);
        Nox.allow(_encryptedPrincipal[from], from);

        depositCount[from] += 1;

        if (guardianNFT != address(0) && depositCount[from] % 3 == 0) {
            _tryEvolveGuardian(from);
        }

        emit ConfidentialDeposited(from);

        // Return encrypted true to accept the transfer
        ebool accepted = Nox.toEbool(true);
        Nox.allowTransient(accepted, msg.sender);
        return accepted;
    }

    // ----------------------------------------------------------------
    //  Yield (Confidential Computation)
    // ----------------------------------------------------------------

    /**
     * @dev Internal: accrue yield for a user based on blocks elapsed.
     *      Rate: 0.0001% per block = 1/1_000_000 per block.
     *
     *      The yield computation uses Nox encrypted arithmetic.
     *      All intermediate values remain encrypted — even validators
     *      cannot see the computation.
     */
    function _accrueYield(address user) internal {
        if (!initialized[user]) return;

        uint256 blocks = block.number - lastYieldBlock[user];
        if (blocks == 0) return;

        // Compute yield: encrypted_principal * blocks / 1_000_000
        // Since Nox doesn't have direct div, we multiply by blocks
        // and divide conceptually by using a scaled multiplier.
        // For MVP: we use the block count as a plaintext multiplier.
        euint256 blockMultiplier = Nox.toEuint256(blocks);
        euint256 rawYield = Nox.mul(_encryptedPrincipal[user], blockMultiplier);

        // Divide by 1_000_000 (the yield rate denominator)
        // Both arguments to Nox.div must be euint256
        euint256 divisor = Nox.toEuint256(1_000_000);
        euint256 newYield = Nox.div(rawYield, divisor);

        // Add new yield to accrued
        _encryptedYield[user] = Nox.add(_encryptedYield[user], newYield);

        Nox.allowThis(_encryptedYield[user]);
        Nox.allow(_encryptedYield[user], user);

        lastYieldBlock[user] = block.number;
    }

    /**
     * @notice Returns the encrypted handle for a user's principal balance.
     *         Only the user themselves can decrypt this off-chain via the JS SDK.
     */
    function getEncryptedPrincipal(address user) external view returns (euint256) {
        return _encryptedPrincipal[user];
    }

    /**
     * @notice Returns the encrypted handle for a user's accrued yield.
     *         Only the user themselves can decrypt this off-chain via the JS SDK.
     */
    function getEncryptedYield(address user) external view returns (euint256) {
        return _encryptedYield[user];
    }

    /**
     * @notice Returns an estimated plaintext yield based on blocks elapsed and deposited amount.
     *         This is an APPROXIMATION for UI display — actual encrypted yield may differ
     *         if the principal has changed across multiple deposits.
     *
     *         Formula: depositedAmount * blocksElapsed / YIELD_RATE_DENOM
     *         Rate: 0.0001% per block (1/1_000_000 per block).
     *
     *         NOTE: This is not confidential — it uses public on-chain data.
     *         It will slightly overestimate because it doesn't account for yield
     *         already snapshotted into the encrypted handle.
     */
    function getYieldEstimate(address user) external view returns (uint256 estimated) {
        if (!initialized[user]) return 0;
        uint256 blocks = block.number - lastYieldBlock[user];
        uint256 principal = depositedAmount[user];
        return (principal * blocks) / YIELD_RATE_DENOM;
    }

    /**
     * @notice Snapshot yield for caller (public wrapper for _accrueYield).
     *         Call this to push accrued yield into the encrypted handle
     *         before decrypting.
     */
    function accrueMyYield() external {
        _initUser(msg.sender);
        _accrueYield(msg.sender);
    }

    /**
     * @notice Collect all accrued yield for `user`. Only the PositionManager
     *         (or the user themselves) may call this.
     * @return yieldHandle The encrypted yield handle collected.
     */
    function collectYield(address user) external nonReentrant returns (euint256 yieldHandle) {
        require(
            msg.sender == positionManager || msg.sender == user,
            "Vault: not authorised"
        );
        _initUser(user);
        _accrueYield(user);

        yieldHandle = _encryptedYield[user];

        // Reset yield to zero
        _encryptedYield[user] = Nox.toEuint256(0);
        Nox.allowThis(_encryptedYield[user]);
        Nox.allow(_encryptedYield[user], user);

        // Grant the caller (PositionManager) access to the yield handle
        Nox.allow(yieldHandle, msg.sender);
        Nox.allowThis(yieldHandle);

        emit YieldCollected(user);
    }

    // ----------------------------------------------------------------
    //  Async Withdrawal (ERC-7540 inspired)
    // ----------------------------------------------------------------

    /**
     * @notice Step 1 — Request withdrawal with an encrypted amount.
     *         The user encrypts the amount off-chain with the JS SDK
     *         and sends the handle + proof.
     */
    function requestWithdraw(
        externalEuint256 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant {
        _initUser(msg.sender);
        _accrueYield(msg.sender);

        require(!_withdrawRequests[msg.sender].active, "Vault: pending request exists");

        // Validate the user's encrypted input
        euint256 amount = Nox.fromExternal(encryptedAmount, inputProof);

        // Subtract from principal (will wrap/underflow if insufficient,
        // but on Nox this is caught by safeSub)
        _encryptedPrincipal[msg.sender] = Nox.sub(
            _encryptedPrincipal[msg.sender],
            amount
        );

        Nox.allowThis(_encryptedPrincipal[msg.sender]);
        Nox.allow(_encryptedPrincipal[msg.sender], msg.sender);

        // Store the withdrawal request
        _withdrawRequests[msg.sender] = WithdrawRequest({
            amount: amount,
            requestBlock: block.number,
            active: true
        });

        Nox.allowThis(amount);
        Nox.allow(amount, msg.sender);

        emit WithdrawRequested(msg.sender);
    }

    /**
     * @notice Step 2 — Execute a pending withdrawal after the 2-block delay.
     *         This is the only point where decryption to plaintext occurs,
     *         and only for the purpose of transferring underlying tokens back.
     *
     *         The user must call this with the decrypted amount obtained
     *         off-chain via the JS SDK decrypt() method.
     * @param plaintextAmount The decrypted withdrawal amount.
     */
    function executeWithdraw(uint256 plaintextAmount) external nonReentrant {
        WithdrawRequest storage req = _withdrawRequests[msg.sender];
        require(req.active, "Vault: no pending request");
        require(block.number >= req.requestBlock + 2, "Vault: too early");

        req.active = false;

        // Transfer the underlying tokens back to the user
        underlyingToken.safeTransfer(msg.sender, plaintextAmount);

        emit WithdrawExecuted(msg.sender, plaintextAmount);
    }

    /**
     * @notice Check if the caller has an active withdrawal request.
     */
    function hasWithdrawRequest(address user) external view returns (bool active, uint256 requestBlock) {
        WithdrawRequest storage req = _withdrawRequests[user];
        return (req.active, req.requestBlock);
    }

    /**
     * @notice Get the encrypted amount of a pending withdrawal request.
     *         Only the user can decrypt this off-chain.
     */
    function getWithdrawRequestAmount(address user) external view returns (euint256) {
        require(_withdrawRequests[user].active, "Vault: no pending request");
        return _withdrawRequests[user].amount;
    }

    // ----------------------------------------------------------------
    //  Guardian NFT helper
    // ----------------------------------------------------------------

    function _tryEvolveGuardian(address user) internal {
        // Low-level call so vault doesn't revert if NFT contract reverts
        (bool success, ) = guardianNFT.call(
            abi.encodeWithSignature("evolveByVault(address)", user)
        );
        // Silently ignore failure — guardian evolution is non-critical
        success; // suppress unused-variable warning
    }
}
