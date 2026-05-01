// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title GuardianNFT
 * @notice Soul-bound-style guardian that evolves as the user keeps depositing.
 *         Max 1 per wallet · 5 levels · vault triggers evolution.
 */
contract GuardianNFT is ERC721, Ownable {
    using Strings for uint256;

    // ----------------------------------------------------------------
    //  State
    // ----------------------------------------------------------------

    uint256 private _nextTokenId;

    /// @notice The YieldShieldVault address — only it may trigger evolution.
    address public vault;

    /// @notice tokenId → level (1-5).
    mapping(uint256 => uint256) public level;

    /// @notice user → tokenId (0 means no guardian yet; valid IDs start at 1).
    mapping(address => uint256) public guardianOf;

    uint256 public constant MAX_LEVEL = 5;

    // ----------------------------------------------------------------
    //  Events
    // ----------------------------------------------------------------

    event GuardianEvolved(uint256 indexed tokenId, uint256 newLevel);

    // ----------------------------------------------------------------
    //  Constructor
    // ----------------------------------------------------------------

    constructor(address _vault) ERC721("YieldShield Guardian", "YSGN") Ownable(msg.sender) {
        require(_vault != address(0), "Guardian: zero vault");
        vault = _vault;
        _nextTokenId = 1; // IDs start at 1
    }

    // ----------------------------------------------------------------
    //  Admin
    // ----------------------------------------------------------------

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    // ----------------------------------------------------------------
    //  Mint
    // ----------------------------------------------------------------

    /**
     * @notice Mint a guardian NFT for `user`. Max 1 per wallet.
     */
    function mintGuardian(address user) external {
        require(guardianOf[user] == 0, "Guardian: already owns one");

        uint256 tokenId = _nextTokenId++;
        _safeMint(user, tokenId);
        level[tokenId] = 1;
        guardianOf[user] = tokenId;
    }

    // ----------------------------------------------------------------
    //  Evolution
    // ----------------------------------------------------------------

    /**
     * @notice Called by the vault contract to level-up a user's guardian.
     *         MVP rule: every 3 deposits → +1 level (max 5).
     */
    function evolveByVault(address user) external {
        require(msg.sender == vault, "Guardian: only vault");
        uint256 tokenId = guardianOf[user];
        require(tokenId != 0, "Guardian: no guardian");
        require(level[tokenId] < MAX_LEVEL, "Guardian: max level");

        level[tokenId] += 1;
        emit GuardianEvolved(tokenId, level[tokenId]);
    }

    // ----------------------------------------------------------------
    //  Metadata
    // ----------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string(abi.encodePacked("YieldShield Guardian Level ", level[tokenId].toString()));
    }
}
