import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("YieldShield Vault Suite", function () {
  // ------------------------------------------------------------------
  //  Fixture — deploys everything once, snapshot is restored per test
  // ------------------------------------------------------------------
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners();

    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const yst = await MockERC20.deploy("YieldShield Token", "YST");

    // Deploy vault
    const Vault = await ethers.getContractFactory("YieldShieldVault");
    const vault = await Vault.deploy(await yst.getAddress());

    // Deploy position manager
    const PM = await ethers.getContractFactory("PositionManager");
    const pm = await PM.deploy(await vault.getAddress());

    // Deploy guardian NFT
    const Guardian = await ethers.getContractFactory("GuardianNFT");
    const guardian = await Guardian.deploy(await vault.getAddress());

    // Deploy badge NFT
    const Badge = await ethers.getContractFactory("BadgeNFT");
    const badge = await Badge.deploy(await pm.getAddress());

    // Link contracts
    await vault.setPositionManager(await pm.getAddress());
    await vault.setGuardianNFT(await guardian.getAddress());
    await pm.setBadgeNFT(await badge.getAddress());

    // Mint tokens to alice for testing
    const mintAmount = ethers.parseEther("10000");
    await yst.mint(alice.address, mintAmount);
    await yst.mint(owner.address, mintAmount);

    // Alice approves vault
    await yst.connect(alice).approve(await vault.getAddress(), ethers.MaxUint256);

    return { yst, vault, pm, guardian, badge, owner, alice, bob };
  }

  // ------------------------------------------------------------------
  //  Deposit tests
  // ------------------------------------------------------------------
  describe("Deposits", function () {
    it("should accept deposits and record principal", async function () {
      const { vault, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("1000");

      await expect(vault.connect(alice).deposit(amount))
        .to.emit(vault, "Deposited")
        .withArgs(alice.address, amount);

      expect(await vault.principal(alice.address)).to.equal(amount);
    });

    it("should reject zero deposits", async function () {
      const { vault, alice } = await loadFixture(deployFixture);
      await expect(vault.connect(alice).deposit(0)).to.be.revertedWith("Vault: zero amount");
    });

    it("should reject deposits when paused", async function () {
      const { vault, alice, owner } = await loadFixture(deployFixture);
      await vault.connect(owner).pauseDeposits(true);
      await expect(vault.connect(alice).deposit(ethers.parseEther("100"))).to.be.revertedWith(
        "Vault: deposits paused"
      );
    });
  });

  // ------------------------------------------------------------------
  //  Yield tests
  // ------------------------------------------------------------------
  describe("Yield accrual", function () {
    it("should accrue yield over blocks", async function () {
      const { vault, alice } = await loadFixture(deployFixture);
      const depositAmount = ethers.parseEther("1000");
      await vault.connect(alice).deposit(depositAmount);

      // Mine 100 blocks
      await mine(100);

      const pending = await vault.pendingYield(alice.address);
      // Expected: 1000e18 * 100 / 1_000_000 = 0.1 tokens = 1e17
      expect(pending).to.equal(ethers.parseEther("0.1"));
    });

    it("should allow user to collect their own yield", async function () {
      const { vault, yst, alice } = await loadFixture(deployFixture);
      await vault.connect(alice).deposit(ethers.parseEther("1000"));
      await mine(100);

      const balBefore = await yst.balanceOf(alice.address);
      await vault.connect(alice).collectYield(alice.address);
      const balAfter = await yst.balanceOf(alice.address);

      expect(balAfter - balBefore).to.be.gt(0);
    });
  });

  // ------------------------------------------------------------------
  //  Async withdrawal tests
  // ------------------------------------------------------------------
  describe("Async withdrawal", function () {
    it("should request and execute withdrawal after 2 blocks", async function () {
      const { vault, yst, alice } = await loadFixture(deployFixture);
      const amount = ethers.parseEther("500");
      await vault.connect(alice).deposit(ethers.parseEther("1000"));

      await expect(vault.connect(alice).requestWithdraw(amount))
        .to.emit(vault, "WithdrawRequested")
        .withArgs(alice.address, amount);

      // Too early
      await expect(vault.connect(alice).executeWithdraw()).to.be.revertedWith("Vault: too early");

      // Mine 2 blocks
      await mine(2);

      const balBefore = await yst.balanceOf(alice.address);
      await expect(vault.connect(alice).executeWithdraw())
        .to.emit(vault, "WithdrawExecuted")
        .withArgs(alice.address, amount);
      const balAfter = await yst.balanceOf(alice.address);

      expect(balAfter - balBefore).to.equal(amount);
      expect(await vault.principal(alice.address)).to.equal(ethers.parseEther("500"));
    });

    it("should reject withdrawal exceeding principal", async function () {
      const { vault, alice } = await loadFixture(deployFixture);
      await vault.connect(alice).deposit(ethers.parseEther("100"));
      await expect(vault.connect(alice).requestWithdraw(ethers.parseEther("200"))).to.be.revertedWith(
        "Vault: insufficient principal"
      );
    });
  });

  // ------------------------------------------------------------------
  //  Position tests
  // ------------------------------------------------------------------
  describe("Position Manager", function () {
    it("should open a position using yield", async function () {
      const { vault, pm, alice } = await loadFixture(deployFixture);
      await vault.connect(alice).deposit(ethers.parseEther("1000"));

      // Mine blocks to accumulate yield
      await mine(1000);

      // Open position with some of the yield
      const yieldAmount = ethers.parseEther("0.5");
      await expect(pm.connect(alice).openPosition(yieldAmount, "BTC", true))
        .to.emit(pm, "PositionOpened");

      const pos = await pm.getPosition(0);
      expect(pos.user).to.equal(alice.address);
      expect(pos.asset).to.equal("BTC");
      expect(pos.isLong).to.equal(true);
      expect(pos.isOpen).to.equal(true);
    });

    it("should close a position and emit result", async function () {
      const { vault, pm, alice } = await loadFixture(deployFixture);
      await vault.connect(alice).deposit(ethers.parseEther("1000"));
      await mine(1000);

      const yieldAmount = ethers.parseEther("0.5");
      await pm.connect(alice).openPosition(yieldAmount, "ETH", false);

      await expect(pm.connect(alice).closePosition(0)).to.emit(pm, "PositionClosed");

      const pos = await pm.getPosition(0);
      expect(pos.isOpen).to.equal(false);
    });

    it("should reject invalid asset", async function () {
      const { vault, pm, alice } = await loadFixture(deployFixture);
      await vault.connect(alice).deposit(ethers.parseEther("1000"));
      await mine(1000);

      await expect(pm.connect(alice).openPosition(ethers.parseEther("0.1"), "DOGE", true)).to.be.revertedWith(
        "PM: invalid asset"
      );
    });

    it("should track user positions", async function () {
      const { vault, pm, alice } = await loadFixture(deployFixture);
      await vault.connect(alice).deposit(ethers.parseEther("10000"));
      await mine(10000);

      await pm.connect(alice).openPosition(ethers.parseEther("0.1"), "BTC", true);

      // Mine more blocks so yield re-accumulates before the second position
      await mine(1000);

      await pm.connect(alice).openPosition(ethers.parseEther("0.1"), "ETH", false);

      const ids = await pm.getUserPositions(alice.address);
      expect(ids.length).to.equal(2);
    });
  });

  // ------------------------------------------------------------------
  //  Guardian NFT tests
  // ------------------------------------------------------------------
  describe("Guardian NFT", function () {
    it("should mint a guardian", async function () {
      const { guardian, alice } = await loadFixture(deployFixture);
      await guardian.mintGuardian(alice.address);
      expect(await guardian.guardianOf(alice.address)).to.equal(1);
      expect(await guardian.level(1)).to.equal(1);
    });

    it("should prevent minting a second guardian", async function () {
      const { guardian, alice } = await loadFixture(deployFixture);
      await guardian.mintGuardian(alice.address);
      await expect(guardian.mintGuardian(alice.address)).to.be.revertedWith("Guardian: already owns one");
    });
  });

  // ------------------------------------------------------------------
  //  Badge NFT tests
  // ------------------------------------------------------------------
  describe("Badge NFT", function () {
    it("should mint badges on position close", async function () {
      const { vault, pm, badge, alice } = await loadFixture(deployFixture);
      await vault.connect(alice).deposit(ethers.parseEther("1000"));
      await mine(1000);

      await pm.connect(alice).openPosition(ethers.parseEther("0.5"), "GOLD", true);
      await pm.connect(alice).closePosition(0);

      const badges = await badge.getUserBadges(alice.address);
      expect(badges.length).to.equal(1);
    });
  });
});
