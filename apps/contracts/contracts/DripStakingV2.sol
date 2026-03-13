// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DripStakingV2
 * @notice Stake G$ tokens to earn points proportional to stake × time.
 *         Points power leaderboards, tier unlocks, and future reward layers.
 * @dev  - No Superfluid dependency
 *       - CEI order maintained throughout
 *       - Safe UUPS upgrade storage layout (__gap)
 */
contract DripStakingV2 is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    /// @notice Denominator for points calculation.
    ///         1 token (1e18 wei) staked for 1 second = 1 point.
    ///         1 token staked for 1 day = 86 400 points.
    uint256 public constant POINTS_DENOMINATOR = 1e18;

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    /// @notice ERC20 token accepted for staking (G$ on Celo)
    IERC20 public token;

    struct StakerInfo {
        uint256 stakedAmount;    // currently staked (in wei)
        uint256 snapshotPoints;  // points banked up to lastUpdateTime
        uint256 lastUpdateTime;  // block.timestamp at last action
    }

    /// @notice Per-staker state
    mapping(address => StakerInfo) public stakers;

    /// @notice Sum of all active stakes
    uint256 public totalStaked;

    /// @notice Monotonically increasing global points counter (for leaderboard)
    uint256 public totalPointsIssued;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event Staked(address indexed staker, uint256 amount, uint256 totalStake, uint256 totalPoints);
    event Unstaked(address indexed staker, uint256 amount, uint256 totalStake, uint256 totalPoints);
    event PointsCheckpointed(address indexed staker, uint256 newSnapshot);
    event ExcessRecovered(address indexed to, uint256 amount);

    // ─────────────────────────────────────────────
    // Initializer
    // ─────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the proxy.
     * @param _token  Address of the ERC20 token to stake (G$)
     */
    function initialize(address _token) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        require(_token != address(0), "Invalid token");
        token = IERC20(_token);
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

    /**
     * @dev Bank accrued points into snapshotPoints and reset the clock.
     *      Must be called before every state change.
     */
    function _checkpointPoints(address staker) internal {
        StakerInfo storage info = stakers[staker];
        uint256 accrued = _accruedSince(info);
        if (accrued > 0) {
            info.snapshotPoints += accrued;
            totalPointsIssued += accrued;
            emit PointsCheckpointed(staker, info.snapshotPoints);
        }
        info.lastUpdateTime = block.timestamp;
    }

    /**
     * @dev Points accrued since last checkpoint (not yet banked).
     */
    function _accruedSince(StakerInfo storage info) internal view returns (uint256) {
        if (info.stakedAmount == 0 || info.lastUpdateTime == 0) return 0;
        uint256 elapsed = block.timestamp - info.lastUpdateTime;
        return (info.stakedAmount * elapsed) / POINTS_DENOMINATOR;
    }

    // ─────────────────────────────────────────────
    // User-facing write functions
    // ─────────────────────────────────────────────

    /**
     * @notice Stake tokens to start earning points.
     * @param amount Amount of tokens to stake (in wei).
     */
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        // ── Effects first ──
        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount += amount;
        totalStaked += amount;

        // ── Interaction last ──
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        emit Staked(
            msg.sender,
            amount,
            totalStaked,
            stakers[msg.sender].snapshotPoints
        );
    }

    /**
     * @notice Unstake tokens. Points already accrued are preserved.
     * @param amount Amount of tokens to unstake (in wei).
     */
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(stakers[msg.sender].stakedAmount >= amount, "Insufficient stake");

        // ── Effects first ──
        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount -= amount;
        totalStaked -= amount;

        // ── Interaction last ──
        require(token.transfer(msg.sender, amount), "Transfer failed");

        emit Unstaked(
            msg.sender,
            amount,
            totalStaked,
            stakers[msg.sender].snapshotPoints
        );
    }

    /**
     * @notice Manually checkpoint points without moving tokens.
     *         Call this to lock in accrued points before an external action.
     */
    function checkpointPoints() external nonReentrant {
        _checkpointPoints(msg.sender);
    }

    /**
     * @notice Emergency unstake: banks all points then returns full stake.
     *         Can be called regardless of connection state.
     */
    function emergencyUnstake() external nonReentrant {
        uint256 amount = stakers[msg.sender].stakedAmount;
        require(amount > 0, "No stake");

        // ── Effects first ──
        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount = 0;
        totalStaked -= amount;

        // ── Interaction last ──
        require(token.transfer(msg.sender, amount), "Transfer failed");

        emit Unstaked(msg.sender, amount, totalStaked, stakers[msg.sender].snapshotPoints);
    }

    // ─────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────

    /**
     * @notice Live total points for a staker (banked + accruing since last checkpoint).
     * @param staker Address to query.
     * @return total  Total points (banked + live accrual).
     */
    function getPoints(address staker) external view returns (uint256 total) {
        StakerInfo storage info = stakers[staker];
        return info.snapshotPoints + _accruedSince(info);
    }

    /**
     * @notice Full staker state in one call.
     * @param staker Address to query.
     * @return stakedAmount     Currently staked tokens.
     * @return totalPoints      Banked + live-accruing points.
     * @return pointsPerSecond  Rate at which points are currently accruing.
     * @return lastUpdate       Timestamp of last checkpoint.
     */
    function getStakerInfo(address staker)
        external
        view
        returns (
            uint256 stakedAmount,
            uint256 totalPoints,
            uint256 pointsPerSecond,
            uint256 lastUpdate
        )
    {
        StakerInfo storage info = stakers[staker];
        stakedAmount     = info.stakedAmount;
        totalPoints      = info.snapshotPoints + _accruedSince(info);
        pointsPerSecond  = info.stakedAmount / POINTS_DENOMINATOR;
        lastUpdate       = info.lastUpdateTime;
    }

    // ─────────────────────────────────────────────
    // Owner functions
    // ─────────────────────────────────────────────

    /**
     * @notice Recover tokens above totalStaked (e.g. accidental direct transfers).
     * @param to  Recipient of excess tokens.
     */
    function recoverExcess(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 balance = token.balanceOf(address(this));
        require(balance > totalStaked, "No excess to recover");
        uint256 excess = balance - totalStaked;
        require(token.transfer(to, excess), "Transfer failed");
        emit ExcessRecovered(to, excess);
    }

    // ─────────────────────────────────────────────
    // UUPS upgrade authorization
    // ─────────────────────────────────────────────

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // ─────────────────────────────────────────────
    // Storage gap (safe UUPS upgrades)
    // ─────────────────────────────────────────────

    uint256[50] private __gap;
}
