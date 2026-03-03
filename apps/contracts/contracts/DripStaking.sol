// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title DripStaking
 * @notice Staking contract with Superfluid Distribution Pools for real-time reward streaming
 * @dev Uses Superfluid's GDAv1 for proportional reward distribution
 * @dev Interfaces match official @superfluid-finance/ethereum-contracts v1.14.1
 */

/// @dev Superfluid pool configuration struct (matches official PoolConfig)
struct PoolConfig {
    bool transferabilityForUnitsOwner;
    bool distributionFromAnyAddress;
}

/// @dev Minimal ISuperfluidPool interface (matches official signatures)
interface ISuperfluidPool {
    function updateMemberUnits(address memberAddr, uint128 newUnits) external returns (bool);
    function claimAll(address memberAddr) external returns (bool);
    function claimAll() external returns (bool);
    function getUnits(address memberAddr) external view returns (uint128);
    function getTotalUnits() external view returns (uint128);
    function getTotalFlowRate() external view returns (int96);
    function getMemberFlowRate(address memberAddr) external view returns (int96);
    function getClaimableNow(address memberAddr) external view returns (int256 claimableBalance, uint256 timestamp);
    function getTotalAmountReceivedByMember(address memberAddr) external view returns (uint256);
}

/// @dev Minimal ISuperToken interface (ERC20 + SuperToken basics)
interface ISuperToken {
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function upgrade(uint256 amount) external;
    function downgrade(uint256 amount) external;
}

/// @dev GDAv1Forwarder interface — same address (0x6DA13Bde224A05a288748d857b9e7DDEffd1dE08) on all chains
interface IGDAv1Forwarder {
    function createPool(address token, address admin, PoolConfig memory config) external returns (bool success, ISuperfluidPool pool);
    function updateMemberUnits(ISuperfluidPool pool, address memberAddress, uint128 newUnits, bytes calldata userData) external returns (bool success);
    function distributeFlow(address token, address from, ISuperfluidPool pool, int96 requestedFlowRate, bytes calldata userData) external returns (bool success);
    function distribute(address token, address from, ISuperfluidPool pool, uint256 requestedAmount, bytes calldata userData) external returns (bool success);
    function connectPool(ISuperfluidPool pool, bytes calldata userData) external returns (bool success);
    function disconnectPool(ISuperfluidPool pool, bytes calldata userData) external returns (bool success);
    function claimAll(ISuperfluidPool pool, address memberAddress, bytes calldata userData) external returns (bool success);
    function isPool(address token, address account) external view returns (bool);
    function isMemberConnected(ISuperfluidPool pool, address member) external view returns (bool);
    function getFlowDistributionFlowRate(address token, address from, ISuperfluidPool to) external view returns (int96);
}

contract DripStaking is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeCast for uint256;
    using SafeCast for int256;

    // ============ State Variables ============

    /// @notice Superfluid Super Token used for staking and rewards
    ISuperToken public superToken;

    /// @notice GDAv1Forwarder for Superfluid pool operations
    IGDAv1Forwarder public gdaForwarder;

    /// @notice Superfluid Pool for reward distribution
    ISuperfluidPool public rewardPool;

    /// @notice Total staked amount across all stakers
    uint256 public totalStaked;

    /// @notice Mapping of staker address to staked amount
    mapping(address => uint256) public stakes;

    /// @notice Mapping of staker address to total rewards claimed
    mapping(address => uint256) public rewardsClaimed;

    /// @notice Admin address that can set reward flow rates
    address public rewardAdmin;

    /// @notice Current reward flow rate (tokens per second)
    int96 public rewardFlowRate;

    /// @notice Scaling factor for unit calculations (prevents precision loss)
    /// @dev Ensures flow rate per unit is significantly > 1 wei
    uint128 public scalingFactor;

    /// @notice Emergency withdrawal enabled flag
    bool public emergencyWithdrawalEnabled;

    // ============ Events ============

    event Staked(
        address indexed staker,
        uint256 amount,
        uint256 newTotalStaked,
        uint128 poolUnits
    );

    event Unstaked(
        address indexed staker,
        uint256 amount,
        uint256 newTotalStaked,
        uint128 poolUnits
    );

    event RewardFlowRateUpdated(int96 newFlowRate);

    event RewardsClaimed(
        address indexed staker,
        uint256 amount
    );

    event RewardPoolCreated(address indexed poolAddress);

    event RewardAdminChanged(address indexed newAdmin);

    event ScalingFactorUpdated(uint128 newFactor);

    // ============ Modifiers ============

    modifier onlyRewardAdmin() {
        require(msg.sender == rewardAdmin || msg.sender == owner(), "Not reward admin");
        _;
    }

    modifier validAmount(uint256 amount) {
        require(amount > 0, "Amount must be > 0");
        _;
    }

    // ============ Initialization ============

    function initialize(
        address _superToken,
        address _gdaForwarder,
        address _rewardAdmin,
        uint128 _scalingFactor
    ) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        require(_superToken != address(0), "Invalid super token");
        require(_gdaForwarder != address(0), "Invalid GDA forwarder");
        require(_rewardAdmin != address(0), "Invalid reward admin");
        require(_scalingFactor > 0, "Scaling factor must be > 0");

        superToken = ISuperToken(_superToken);
        gdaForwarder = IGDAv1Forwarder(_gdaForwarder);
        rewardAdmin = _rewardAdmin;
        scalingFactor = _scalingFactor;
        emergencyWithdrawalEnabled = false;
    }

    // ============ Pool Management ============

    /**
     * @notice Create the reward distribution pool
     * @dev Uses SuperToken's native pool API (Superfluid v2)
     * This must be called before any staking can occur
     */
    function createRewardPool() external onlyOwner returns (address poolAddress) {
        require(address(rewardPool) == address(0), "Pool already created");

        // Create pool via GDAv1Forwarder with address(this) as admin
        // Units not transferable, distribution from any address allowed
        (bool success, ISuperfluidPool pool) = gdaForwarder.createPool(
            address(superToken),
            address(this),
            PoolConfig({
                transferabilityForUnitsOwner: false,
                distributionFromAnyAddress: true
            })
        );
        require(success, "Pool creation failed");
        rewardPool = pool;

        emit RewardPoolCreated(address(rewardPool));
        return address(rewardPool);
    }

    // ============ Staking Functions ============

    /**
     * @notice Stake tokens to earn reward stream
     * @param amount Amount of super tokens to stake
     */
    function stake(uint256 amount)
        external
        nonReentrant
        validAmount(amount)
    {
        require(address(rewardPool) != address(0), "Pool not created");

        // Transfer tokens from staker to contract
        require(
            superToken.transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );

        // Update stake
        uint256 oldStake = stakes[msg.sender];
        stakes[msg.sender] = oldStake + amount;
        totalStaked = totalStaked + amount;

        // Update pool units using scaling factor
        // units = staked_amount / scaling_factor
        uint128 newUnits = SafeCast.toUint128(stakes[msg.sender] / scalingFactor);
        require(newUnits > 0, "Stake too small for pool units");
        require(
            rewardPool.updateMemberUnits(msg.sender, newUnits),
            "Member update failed"
        );

        // Auto-connect to pool on first stake for real-time reward streaming
        if (oldStake == 0 && !gdaForwarder.isMemberConnected(rewardPool, msg.sender)) {
            gdaForwarder.connectPool(rewardPool, "");
        }

        emit Staked(msg.sender, amount, totalStaked, newUnits);
    }

    /**
     * @notice Unstake tokens and stop earning rewards
     * @param amount Amount of super tokens to unstake
     */
    function unstake(uint256 amount)
        external
        nonReentrant
        validAmount(amount)
    {
        require(stakes[msg.sender] >= amount, "Insufficient stake");

        // Update stake
        stakes[msg.sender] = stakes[msg.sender] - amount;
        totalStaked = totalStaked - amount;

        // Update pool units
        uint128 newUnits = SafeCast.toUint128(stakes[msg.sender] / scalingFactor);
        require(
            rewardPool.updateMemberUnits(msg.sender, newUnits),
            "Member update failed"
        );

        // Transfer tokens back to staker
        require(superToken.transfer(msg.sender, amount), "Transfer failed");

        emit Unstaked(msg.sender, amount, totalStaked, newUnits);
    }

    // ============ Pool Connection ============

    /**
     * @notice Connect to the reward pool to receive distributions in real-time
     * @dev Automatically claims accumulated rewards and starts streaming to balance
     */
    function connectToPool() external nonReentrant {
        require(address(rewardPool) != address(0), "Pool not created");
        require(stakes[msg.sender] > 0, "No active stake");
        require(!gdaForwarder.isMemberConnected(rewardPool, msg.sender), "Already connected");
        
        require(gdaForwarder.connectPool(rewardPool, ""), "Connection failed");
    }

    /**
     * @notice Disconnect from the reward pool to stop receiving distributions in real-time
     * @dev Rewards will accumulate in claimable state after disconnecting
     */
    function disconnectFromPool() external nonReentrant {
        require(address(rewardPool) != address(0), "Pool not created");
        require(gdaForwarder.isMemberConnected(rewardPool, msg.sender), "Not connected");
        
        require(gdaForwarder.disconnectPool(rewardPool, ""), "Disconnection failed");
    }

    /**
     * @notice Check if an address is connected to the reward pool
     * @param member Address to check
     * @return connected True if connected, false otherwise
     */
    function isConnectedToPool(address member) external view returns (bool connected) {
        if (address(rewardPool) == address(0)) {
            return false;
        }
        return gdaForwarder.isMemberConnected(rewardPool, member);
    }

    // ============ Reward Management ============

    /**
     * @notice Set the reward flow rate (tokens per second to distribute)
     * @param newFlowRate Flow rate in tokens/second (with 18 decimals)
     * @dev Flow rate calculation: for 100 tokens/day = 100 / 86400 = ~1157407407407 (wei/second)
     * @dev This actually starts the distribution of rewards into the pool
     */
    function setRewardFlowRate(int96 newFlowRate)
        external
        onlyRewardAdmin
    {
        require(address(rewardPool) != address(0), "Pool not created");
        require(newFlowRate >= 0, "Flow rate must be non-negative");

        // Use GDAv1Forwarder to distribute flow
        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), rewardPool, newFlowRate, ""),
            "distributeFlow failed"
        );

        rewardFlowRate = newFlowRate;
        emit RewardFlowRateUpdated(newFlowRate);
    }

    /**
     * @notice Claim accumulated rewards from the distribution pool
     * @return claimed Amount of tokens claimed
     */
    function claimRewards() public nonReentrant returns (uint256 claimed) {
        require(address(rewardPool) != address(0), "Pool not created");
        require(stakes[msg.sender] > 0, "No active stake");

        // Get balance before claim to calculate amount
        uint256 balBefore = superToken.balanceOf(msg.sender);
        rewardPool.claimAll(msg.sender);
        uint256 balAfter = superToken.balanceOf(msg.sender);
        claimed = balAfter > balBefore ? balAfter - balBefore : 0;

        rewardsClaimed[msg.sender] = rewardsClaimed[msg.sender] + claimed;

        emit RewardsClaimed(msg.sender, claimed);
        return claimed;
    }

    /**
     * @notice Get current reward rate for a staker
     * @param staker Address of the staker
     * @return rate Rate per second (tokens/second) based on proportion of pool
     */
    function getStakerRewardRate(address staker)
        external
        view
        returns (int96 rate)
    {
        if (totalStaked == 0 || stakes[staker] == 0) {
            return 0;
        }

        // Proportion of pool: staker_stake / total_staked
        // Reward rate: (staker_proportion) * rewardFlowRate
        rate = int96(int256((uint256(uint96(rewardFlowRate)) * stakes[staker]) / totalStaked));
        return rate;
    }

    /**
     * @notice Get stake information for an address
     * @param staker Address to query
     * @return staked Amount staked
     * @return claimed Rewards claimed
     * @return rate Current reward rate per second
     */
    function getStakeInfo(address staker)
        external
        view
        returns (
            uint256 staked,
            uint256 claimed,
            int96 rate
        )
    {
        staked = stakes[staker];
        claimed = rewardsClaimed[staker];
        if (totalStaked == 0 || staked == 0) {
            rate = 0;
        } else {
            rate = int96(int256((uint256(uint96(rewardFlowRate)) * staked) / totalStaked));
        }
    }

    /**
     * @notice Get current pool units for a staker
     * @param staker Address to query
     * @return units Current pool units (0 if not a pool member)
     */
    function getPoolUnits(address staker)
        external
        view
        returns (uint128 units)
    {
        if (address(rewardPool) == address(0)) {
            return 0;
        }
        return rewardPool.getUnits(staker);
    }

    // ============ Admin Functions ============

    /**
     * @notice Update reward admin address
     * @param newAdmin New admin address
     */
    function setRewardAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        rewardAdmin = newAdmin;
        emit RewardAdminChanged(newAdmin);
    }

    /**
     * @notice Update scaling factor for unit calculations
     * @param newFactor New scaling factor (must be > 0)
     * @dev Recommended value: 1e15 to 1e18 depending on expected stake sizes
     */
    function setScalingFactor(uint128 newFactor) external onlyOwner {
        require(newFactor > 0, "Scaling factor must be > 0");
        scalingFactor = newFactor;
        emit ScalingFactorUpdated(newFactor);
    }

    /**
     * @notice Enable emergency withdrawal (withdraws without claiming rewards)
     */
    function enableEmergencyWithdrawal() external onlyOwner {
        emergencyWithdrawalEnabled = true;
    }

    /**
     * @notice Disable emergency withdrawal
     */
    function disableEmergencyWithdrawal() external onlyOwner {
        emergencyWithdrawalEnabled = false;
    }

    /**
     * @notice Emergency unstake if pool is compromised
     */
    function emergencyUnstake() external nonReentrant {
        require(emergencyWithdrawalEnabled, "Emergency withdrawal disabled");
        require(stakes[msg.sender] > 0, "No stake");

        uint256 amount = stakes[msg.sender];
        stakes[msg.sender] = 0;
        totalStaked = totalStaked - amount;

        require(rewardPool.updateMemberUnits(msg.sender, 0), "Member update failed");
        require(superToken.transfer(msg.sender, amount), "Transfer failed");

        emit Unstaked(msg.sender, amount, totalStaked, 0);
    }

    /**
     * @notice Recover adjustment flow dust (rounding remainder sent to pool admin)
     * @param to Address to send recovered tokens to
     */
    function recoverAdjustmentFlow(address to) external onlyOwner {
        require(to != address(0), "Invalid address");
        uint256 contractBalance = superToken.balanceOf(address(this));
        uint256 excess = contractBalance > totalStaked ? contractBalance - totalStaked : 0;
        require(excess > 0, "No excess to recover");
        require(superToken.transfer(to, excess), "Transfer failed");
    }

    /**
     * @notice Get claimable rewards for a staker
     * @param staker Address to query
     * @return claimable Amount of tokens claimable now
     */
    function getClaimableRewards(address staker) external view returns (int256 claimable) {
        if (address(rewardPool) == address(0) || stakes[staker] == 0) {
            return 0;
        }
        (claimable, ) = rewardPool.getClaimableNow(staker);
    }

    // ============ Upgrade Authorization ============

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    // ============ Receive Function ============

    receive() external payable {}
}
