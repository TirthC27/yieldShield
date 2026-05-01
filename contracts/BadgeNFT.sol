// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title BadgeNFT
 * @notice Trade-history badges minted automatically when a leveraged
 *         position is closed. Each badge records outcome, amount, and asset.
 */
contract BadgeNFT is ERC721, Ownable {
    using Strings for uint256;

    // ----------------------------------------------------------------
    //  Types
    // ----------------------------------------------------------------

    struct Badge {
        bool won;
        uint256 amount;
        string asset;
        uint256 timestamp;
    }

    // ----------------------------------------------------------------
    //  State
    // ----------------------------------------------------------------

    uint256 private _nextTokenId;

    /// @notice The PositionManager — only it may mint badges.
    address public positionManager;

    /// @notice tokenId → badge data.
    mapping(uint256 => Badge) public badges;

    /// @notice user → array of badge token IDs.
    mapping(address => uint256[]) private _userBadges;

    // ----------------------------------------------------------------
    //  Events
    // ----------------------------------------------------------------

    event BadgeMinted(address indexed user, uint256 indexed tokenId, bool won, string asset);

    // ----------------------------------------------------------------
    //  Constructor
    // ----------------------------------------------------------------

    constructor(address _positionManager) ERC721("YieldShield Badge", "YSBG") Ownable(msg.sender) {
        require(_positionManager != address(0), "Badge: zero PM");
        positionManager = _positionManager;
        _nextTokenId = 1;
    }

    // ----------------------------------------------------------------
    //  Admin
    // ----------------------------------------------------------------

    function setPositionManager(address _pm) external onlyOwner {
        positionManager = _pm;
    }

    // ----------------------------------------------------------------
    //  Mint
    // ----------------------------------------------------------------

    /**
     * @notice Mint a badge recording a closed position.
     *         Only the PositionManager may call this.
     */
    function mintBadge(
        address user,
        bool won,
        uint256 amount,
        string memory asset
    ) external {
        require(msg.sender == positionManager, "Badge: only PM");

        uint256 tokenId = _nextTokenId++;
        _safeMint(user, tokenId);

        badges[tokenId] = Badge({
            won: won,
            amount: amount,
            asset: asset,
            timestamp: block.timestamp
        });

        _userBadges[user].push(tokenId);

        emit BadgeMinted(user, tokenId, won, asset);
    }

    // ----------------------------------------------------------------
    //  Views
    // ----------------------------------------------------------------

    function getUserBadges(address user) external view returns (uint256[] memory) {
        return _userBadges[user];
    }

    function getBadge(uint256 tokenId) external view returns (Badge memory) {
        _requireOwned(tokenId);
        return badges[tokenId];
    }

    // ----------------------------------------------------------------
    //  Metadata
    // ----------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Badge storage b = badges[tokenId];
        return string(
            abi.encodePacked(
                b.won ? "WIN" : "LOSS",
                " | ",
                b.amount.toString(),
                " | ",
                b.asset,
                " | ",
                b.timestamp.toString()
            )
        );
    }
}
