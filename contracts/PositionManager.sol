// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Nox, euint256, externalEuint256, ebool} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IConfidentialVault {
    function collectYield(address user) external returns (euint256);
    function underlyingToken() external view returns (address);
}

interface IBadgeNFT {
    function mintBadge(address user, bool won, uint256 amount, string memory asset) external;
}

/**
 * @title PositionManager
 * @notice Opens and closes leveraged positions using ONLY accrued yield.
 *         Principal is never at risk.
 *
 * Positions are stored with encrypted fields:
 *   - euint256 size:  encrypted position size — MEV bots cannot see exposure
 *   - ebool isLong:   encrypted direction — bots cannot front-run or copy-trade
 *
 * Fixed 3× leverage. Supported assets: BTC, ETH, GOLD.
 * MVP outcome: block.timestamp % 2 (0 = loss, 1 = win).
 */
contract PositionManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------
    //  Types
    // ----------------------------------------------------------------

    struct Position {
        address user;
        euint256 size;          // Encrypted — bots cannot see position size
        ebool isLong;           // Encrypted — bots cannot see direction
        string asset;           // Asset name stays public (BTC, ETH, GOLD)
        uint256 openTimestamp;
        bool isOpen;
        bool settled;           // Whether outcome has been determined
        bool won;               // Outcome (set on close)
        uint256 plaintextSize;  // Set on close after decryption for payout
    }

    // ----------------------------------------------------------------
    //  State
    // ----------------------------------------------------------------

    IConfidentialVault public immutable vault;
    IERC20 public immutable token;

    uint256 public constant LEVERAGE = 3;

    Position[] public positions;

    /// @notice User address → array of position IDs they own
    mapping(address => uint256[]) private _userPositions;

    /// @notice Claimable winnings per user (plaintext, after settlement)
    mapping(address => uint256) public claimable;

    address public badgeNFT;

    // ----------------------------------------------------------------
    //  Events
    // ----------------------------------------------------------------

    event PositionOpened(
        address indexed user,
        uint256 indexed positionId,
        string asset
        // Note: size and direction are NOT emitted — they are confidential
    );

    event PositionClosed(
        address indexed user,
        uint256 indexed positionId,
        bool won,
        uint256 payout
    );

    event Claimed(address indexed user, uint256 amount);

    // ----------------------------------------------------------------
    //  Constructor
    // ----------------------------------------------------------------

    constructor(address _vault) Ownable(msg.sender) {
        require(_vault != address(0), "PM: zero vault");
        vault = IConfidentialVault(_vault);
        token = IERC20(vault.underlyingToken());
    }

    // ----------------------------------------------------------------
    //  Admin
    // ----------------------------------------------------------------

    function setBadgeNFT(address _badge) external onlyOwner {
        badgeNFT = _badge;
    }

    // ----------------------------------------------------------------
    //  Position lifecycle
    // ----------------------------------------------------------------

    /**
     * @notice Open a leveraged position using the caller's accrued yield.
     *         The yield amount is collected from the vault as an encrypted handle.
     *         The direction (long/short) is encrypted off-chain by the user.
     *
     * @param asset           Target asset — "BTC", "ETH", or "GOLD"
     * @param encDirection    Encrypted boolean: true = long, false = short
     * @param directionProof  Proof for the encrypted direction
     */
    function openPosition(
        string memory asset,
        externalEuint256 encDirection,
        bytes calldata directionProof
    ) external nonReentrant {
        require(_validAsset(asset), "PM: invalid asset");

        // Collect ALL accrued yield from vault (returns encrypted handle)
        euint256 yieldAmount = vault.collectYield(msg.sender);

        // Validate the encrypted direction from user
        // We use euint256 for the direction handle, then convert conceptually
        // (Nox ebool from external is handled via encryptInput with 'bool' type)
        euint256 directionHandle = Nox.fromExternal(encDirection, directionProof);

        // Store as ebool (0 = short, non-zero = long)
        // For MVP we treat any non-zero as long
        ebool isLongEnc = Nox.ne(directionHandle, Nox.toEuint256(0));

        uint256 positionId = positions.length;
        positions.push(Position({
            user: msg.sender,
            size: yieldAmount,
            isLong: isLongEnc,
            asset: asset,
            openTimestamp: block.timestamp,
            isOpen: true,
            settled: false,
            won: false,
            plaintextSize: 0
        }));

        // Grant contract access to position handles for future operations
        Nox.allowThis(yieldAmount);
        Nox.allow(yieldAmount, msg.sender);
        Nox.allowThis(isLongEnc);
        Nox.allow(isLongEnc, msg.sender);

        _userPositions[msg.sender].push(positionId);

        // Size and direction are NOT included in the event — confidential
        emit PositionOpened(msg.sender, positionId, asset);
    }

    /**
     * @notice Open a position with a plaintext yield amount and direction.
     *         Simpler entry point for MVP — the contract encrypts internally.
     *
     * @param yieldAmount Plaintext yield to allocate (collected from vault)
     * @param asset       Target asset — "BTC", "ETH", or "GOLD"
     * @param isLong      True = long, false = short
     */
    function openPositionPlaintext(
        uint256 yieldAmount,
        string memory asset,
        bool isLong
    ) external nonReentrant {
        require(yieldAmount > 0, "PM: zero yield");
        require(_validAsset(asset), "PM: invalid asset");

        // Collect yield from vault (the encrypted handle is not used directly in plaintext mode,
        // but the vault side-effect of resetting accrued yield is needed)
        vault.collectYield(msg.sender);

        // Encrypt the requested amount and direction
        euint256 encSize = Nox.toEuint256(yieldAmount);
        ebool encLong = Nox.toEbool(isLong);

        uint256 positionId = positions.length;
        positions.push(Position({
            user: msg.sender,
            size: encSize,
            isLong: encLong,
            asset: asset,
            openTimestamp: block.timestamp,
            isOpen: true,
            settled: false,
            won: false,
            plaintextSize: 0
        }));

        Nox.allowThis(encSize);
        Nox.allow(encSize, msg.sender);
        Nox.allowThis(encLong);
        Nox.allow(encLong, msg.sender);

        _userPositions[msg.sender].push(positionId);

        emit PositionOpened(msg.sender, positionId, asset);
    }

    /**
     * @notice Close an open position. The user provides the decrypted size
     *         (obtained off-chain via the JS SDK) for settlement.
     *         Outcome is simulated for MVP (block.timestamp % 2).
     *
     * @param positionId     ID of the position to close
     * @param decryptedSize  The decrypted position size (from JS SDK)
     */
    function closePosition(uint256 positionId, uint256 decryptedSize) external nonReentrant {
        require(positionId < positions.length, "PM: invalid id");
        Position storage pos = positions[positionId];
        require(pos.isOpen, "PM: already closed");
        require(pos.user == msg.sender, "PM: not owner");

        pos.isOpen = false;
        pos.settled = true;
        pos.plaintextSize = decryptedSize;

        // MVP randomness: block.timestamp % 2
        bool won = (block.timestamp % 2 == 1);
        pos.won = won;

        uint256 payout = 0;
        if (won) {
            payout = decryptedSize * LEVERAGE;
            claimable[msg.sender] += payout;
        }
        // If lost, yield amount is simply burned (already collected from vault)

        // Mint a badge NFT recording the trade outcome
        if (badgeNFT != address(0)) {
            try IBadgeNFT(badgeNFT).mintBadge(msg.sender, won, decryptedSize, pos.asset) {} catch {}
        }

        emit PositionClosed(msg.sender, positionId, won, payout);
    }

    /**
     * @notice Claim accumulated winnings.
     */
    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "PM: nothing to claim");
        claimable[msg.sender] = 0;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // ----------------------------------------------------------------
    //  Views
    // ----------------------------------------------------------------

    /**
     * @notice Get the encrypted size handle for a position.
     *         Only the position owner can decrypt off-chain.
     */
    function getPositionEncryptedSize(uint256 positionId) external view returns (euint256) {
        require(positionId < positions.length, "PM: invalid id");
        return positions[positionId].size;
    }

    /**
     * @notice Get the encrypted direction handle for a position.
     *         Only the position owner can decrypt off-chain.
     */
    function getPositionEncryptedDirection(uint256 positionId) external view returns (ebool) {
        require(positionId < positions.length, "PM: invalid id");
        return positions[positionId].isLong;
    }

    /**
     * @notice Get basic (non-encrypted) position info.
     */
    function getPositionInfo(uint256 positionId) external view returns (
        address user,
        string memory asset,
        uint256 openTimestamp,
        bool isOpen,
        bool settled,
        bool won,
        uint256 plaintextSize
    ) {
        require(positionId < positions.length, "PM: invalid id");
        Position storage pos = positions[positionId];
        return (pos.user, pos.asset, pos.openTimestamp, pos.isOpen, pos.settled, pos.won, pos.plaintextSize);
    }

    function getUserPositions(address user) external view returns (uint256[] memory) {
        return _userPositions[user];
    }

    function totalPositions() external view returns (uint256) {
        return positions.length;
    }

    // ----------------------------------------------------------------
    //  Internal
    // ----------------------------------------------------------------

    function _validAsset(string memory asset) internal pure returns (bool) {
        bytes32 h = keccak256(abi.encodePacked(asset));
        return (
            h == keccak256("BTC") ||
            h == keccak256("ETH") ||
            h == keccak256("GOLD")
        );
    }
}
