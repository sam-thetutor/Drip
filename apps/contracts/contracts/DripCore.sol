// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./utils/TokenHelper.sol";

struct PoolConfig {
    bool transferabilityForUnitsOwner;
    bool distributionFromAnyAddress;
}

interface ISuperfluidPool {
    function updateMemberUnits(address memberAddr, uint128 newUnits) external returns (bool);
}

interface IGDAv1Forwarder {
    function createPool(address token, address admin, PoolConfig memory config)
        external
        returns (bool success, ISuperfluidPool pool);

    function distributeFlow(
        address token,
        address from,
        ISuperfluidPool pool,
        int96 requestedFlowRate,
        bytes calldata userData
    ) external returns (bool success);
}

contract DripCore is Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    using TokenHelper for address;

    struct StakerInfo {
        uint256 stakedAmount;
        uint256 stakingTime;
    }

    address public stakingToken;
    IGDAv1Forwarder public gdaForwarder;
    ISuperfluidPool public stakerPool;

    bool public stakingEnabled;
    bool public stakerFlowActive;

    uint256 public totalStaked;
    uint256 public totalRewardsFunded;
    uint256 public totalRewardsDistributed;

    uint256 public activeStakerFlowStart;
    int96 public activeStakerFlowRate;
    uint256 public activeStakerFlowReserved;

    mapping(address => StakerInfo) public stakers;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _owner) public initializer {
        require(_owner != address(0), "DripCore: Invalid owner");
        __ReentrancyGuard_init();
        __Ownable_init(_owner);
    }

    function setStakingConfig(address _stakingToken, address _gdaForwarder) external onlyOwner {
        require(_stakingToken != address(0), "DripCore: Invalid staking token");
        require(_gdaForwarder != address(0), "DripCore: Invalid gda forwarder");
        require(!stakerFlowActive, "DripCore: Stop flow before reconfiguring");

        stakingToken = _stakingToken;
        gdaForwarder = IGDAv1Forwarder(_gdaForwarder);

        emit StakingConfigSet(_stakingToken, _gdaForwarder);
    }

    function setStakingEnabled(bool _enabled) external onlyOwner {
        stakingEnabled = _enabled;
        emit StakingEnabledSet(_enabled);
    }

    function createStakerPool() external onlyOwner returns (address poolAddress) {
        require(stakingToken != address(0), "DripCore: Staking token not configured");
        require(address(gdaForwarder) != address(0), "DripCore: Forwarder not configured");
        require(address(stakerPool) == address(0), "DripCore: Staker pool already exists");

        (bool success, ISuperfluidPool pool) = gdaForwarder.createPool(
            stakingToken,
            address(this),
            PoolConfig({transferabilityForUnitsOwner: false, distributionFromAnyAddress: true})
        );
        require(success, "DripCore: Pool creation failed");

        stakerPool = pool;
        emit StakerPoolCreated(address(pool));
        return address(pool);
    }

    function stake(uint256 amount) external nonReentrant {
        require(stakingEnabled, "DripCore: Staking disabled");
        require(stakingToken != address(0), "DripCore: Staking token not configured");
        require(address(stakerPool) != address(0), "DripCore: Staker pool not created");
        require(amount > 0, "DripCore: Amount must be > 0");

        require(TokenHelper.safeTransferFrom(stakingToken, msg.sender, address(this), amount), "DripCore: Stake transfer failed");

        StakerInfo storage info = stakers[msg.sender];
        info.stakedAmount += amount;
        info.stakingTime = block.timestamp;
        totalStaked += amount;

        uint128 newUnits = _updateStakerUnits(msg.sender);
        emit Staked(msg.sender, amount, newUnits);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(stakingToken != address(0), "DripCore: Staking token not configured");
        require(address(stakerPool) != address(0), "DripCore: Staker pool not created");
        require(amount > 0, "DripCore: Amount must be > 0");

        StakerInfo storage info = stakers[msg.sender];
        require(info.stakedAmount >= amount, "DripCore: Insufficient staked balance");

        info.stakedAmount -= amount;
        info.stakingTime = info.stakedAmount > 0 ? block.timestamp : 0;
        totalStaked -= amount;

        uint128 newUnits = _updateStakerUnits(msg.sender);

        require(TokenHelper.safeTransfer(stakingToken, msg.sender, amount), "DripCore: Unstake transfer failed");
        emit Unstaked(msg.sender, amount, newUnits);
    }

    function updateStakingMultiplier() external nonReentrant {
        require(stakers[msg.sender].stakedAmount > 0, "DripCore: No active stake");
        uint128 newUnits = _updateStakerUnits(msg.sender);
        emit StakerUnitsUpdated(msg.sender, newUnits);
    }

    function fundRewardsPool(uint256 amount) external onlyOwner nonReentrant {
        require(stakingToken != address(0), "DripCore: Staking token not configured");
        require(amount > 0, "DripCore: Amount must be > 0");

        require(TokenHelper.safeTransferFrom(stakingToken, msg.sender, address(this), amount), "DripCore: Reward fund transfer failed");

        totalRewardsFunded += amount;
        emit RewardsFunded(msg.sender, amount);
    }

    function startStakerRewardsFlow(uint256 durationSeconds) external onlyOwner {
        require(stakingToken != address(0), "DripCore: Staking token not configured");
        require(address(stakerPool) != address(0), "DripCore: Staker pool not created");
        require(address(gdaForwarder) != address(0), "DripCore: Forwarder not configured");
        require(totalStaked > 0, "DripCore: No stakers");
        require(!stakerFlowActive, "DripCore: Staker flow already active");
        require(durationSeconds > 0, "DripCore: Invalid duration");

        uint256 availableBudget = getAvailableRewardsBudget();
        require(availableBudget > 0, "DripCore: No rewards budget");

        uint256 flowRateRaw = availableBudget / durationSeconds;
        require(flowRateRaw > 0, "DripCore: Flow rate too small");
        require(flowRateRaw <= uint256(uint96(type(int96).max)), "DripCore: Flow rate overflow");

        int96 flowRate = int96(uint96(flowRateRaw));

        bool success = gdaForwarder.distributeFlow(stakingToken, address(this), stakerPool, flowRate, "");
        require(success, "DripCore: Failed to start flow");

        stakerFlowActive = true;
        activeStakerFlowStart = block.timestamp;
        activeStakerFlowRate = flowRate;
        activeStakerFlowReserved = availableBudget;

        emit StakerFlowStarted(flowRate, durationSeconds, availableBudget);
    }

    function stopStakerRewardsFlow() external onlyOwner {
        require(stakerFlowActive, "DripCore: No active staker flow");
        require(address(gdaForwarder) != address(0), "DripCore: Forwarder not configured");
        require(address(stakerPool) != address(0), "DripCore: Staker pool not created");

        bool success = gdaForwarder.distributeFlow(stakingToken, address(this), stakerPool, 0, "");
        require(success, "DripCore: Failed to stop flow");

        uint256 elapsed = block.timestamp > activeStakerFlowStart ? block.timestamp - activeStakerFlowStart : 0;
        uint256 spent = elapsed * uint256(uint96(activeStakerFlowRate));
        if (spent > activeStakerFlowReserved) {
            spent = activeStakerFlowReserved;
        }

        totalRewardsDistributed += spent;
        stakerFlowActive = false;
        activeStakerFlowStart = 0;
        activeStakerFlowRate = 0;
        activeStakerFlowReserved = 0;

        emit StakerFlowStopped(spent);
    }

    function getAvailableRewardsBudget() public view returns (uint256) {
        if (totalRewardsFunded <= totalRewardsDistributed) {
            return 0;
        }

        uint256 undistributed = totalRewardsFunded - totalRewardsDistributed;
        if (stakerFlowActive && activeStakerFlowReserved <= undistributed) {
            return undistributed - activeStakerFlowReserved;
        }

        return undistributed;
    }

    function getStakerInfo(address staker)
        external
        view
        returns (uint256 stakedAmount, uint256 stakingTime, uint128 units)
    {
        StakerInfo memory info = stakers[staker];
        return (info.stakedAmount, info.stakingTime, _calculateStakerUnits(staker));
    }

    function _calculateStakerUnits(address staker) internal view returns (uint128) {
        StakerInfo memory info = stakers[staker];
        if (info.stakedAmount == 0 || info.stakingTime == 0) {
            return 0;
        }

        uint256 baseUnits = info.stakedAmount / 1e12;
        if (baseUnits == 0) {
            return 0;
        }

        uint256 daysStaked = (block.timestamp - info.stakingTime) / 1 days;
        uint256 multiplier = 100 + (daysStaked * 5);
        if (multiplier > 300) {
            multiplier = 300;
        }

        uint256 units = (baseUnits * multiplier) / 100;
        require(units <= type(uint128).max, "DripCore: Units overflow");
        return uint128(units);
    }

    function _updateStakerUnits(address staker) internal returns (uint128 newUnits) {
        newUnits = _calculateStakerUnits(staker);
        bool success = stakerPool.updateMemberUnits(staker, newUnits);
        require(success, "DripCore: Failed to update staker units");
    }

    event StakingConfigSet(address indexed stakingToken, address indexed gdaForwarder);
    event StakingEnabledSet(bool enabled);
    event StakerPoolCreated(address indexed pool);
    event RewardsFunded(address indexed by, uint256 amount);
    event StakerFlowStarted(int96 flowRate, uint256 durationSeconds, uint256 reservedAmount);
    event StakerFlowStopped(uint256 spent);
    event Staked(address indexed staker, uint256 amount, uint128 newUnits);
    event Unstaked(address indexed staker, uint256 amount, uint128 newUnits);
    event StakerUnitsUpdated(address indexed staker, uint128 newUnits);
}
