// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IDrip.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ─── Superfluid interfaces (same as DripCoreSuperfluid) ────────────────────

struct PoolConfig {
    bool transferabilityForUnitsOwner;
    bool distributionFromAnyAddress;
}

interface ISuperfluidPool {
    function updateMemberUnits(address memberAddr, uint128 newUnits) external returns (bool);
    function claimAll(address memberAddr) external returns (bool);
    function getClaimableNow(address memberAddr) external view returns (int256 claimableBalance, uint256 timestamp);
}

interface ISuperToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IGDAv1Forwarder {
    function createPool(address token, address admin, PoolConfig memory config) external returns (bool success, ISuperfluidPool pool);
    function distributeFlow(address token, address from, ISuperfluidPool pool, int96 requestedFlowRate, bytes calldata userData) external returns (bool success);
    function connectPool(ISuperfluidPool pool, bytes calldata userData) external returns (bool);
}

/**
 * @title DripCoreV3
 * @notice Merged contract: Superfluid token streaming + G$ staking with points.
 *         Deployed as the new implementation behind the existing TransparentProxy
 *         at 0x5530975fDe062FE6706298fF3945E3d1a17A310a.
 *
 * Storage layout rules (CRITICAL — never reorder lines below):
 *   Slots 0-14  → identical to DripCoreSuperfluid (streaming state)
 *   Slots 15-18 → new staking state (appended)
 *   Slots 19-21 → phone mapping state
 *   Slots 22-66 → __gap (reserved for future upgrades)
 */
contract DripCoreV3 is IDrip, Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — constants (not in storage)
    // ═══════════════════════════════════════════════════════════════

    uint256 public constant MIN_DURATION = 3600;
    uint256 public constant MAX_DURATION = 315360000;
    uint256 public constant MAX_TITLE_LEN = 120;
    uint256 public constant MAX_DESCRIPTION_LEN = 1024;

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — structs (no storage impact)
    // ═══════════════════════════════════════════════════════════════

    struct StreamRuntime {
        ISuperfluidPool pool;
        int96 totalFlowRate;
        uint256 remainingBudget;
        uint256 totalDistributedAccounting;
        uint256 lastAccountingTimestamp;
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — storage (mirrors DripCoreSuperfluid slot-for-slot)
    // DO NOT reorder, insert, or remove any variable in this block.
    // ═══════════════════════════════════════════════════════════════

    uint256 private _streamIdCounter;
    mapping(uint256 => Stream) private _streams;
    mapping(uint256 => StreamRuntime) private _streamRuntime;
    mapping(uint256 => mapping(address => bool)) private _isRecipientInStream;
    mapping(uint256 => mapping(address => uint256)) private _recipientRates;
    mapping(uint256 => mapping(address => uint256)) private _recipientTotalWithdrawn;
    mapping(uint256 => mapping(address => uint256)) private _recipientLastWithdraw;
    mapping(address => uint256[]) private _senderStreams;
    mapping(address => uint256[]) private _recipientStreams;
    uint256 public platformFeeBps;
    address public platformFeeRecipient;
    ISuperToken public superToken;
    IGDAv1Forwarder public gdaForwarder;
    address public engagementRewards;
    bool public engagementRewardsEnabled;
    mapping(address => address) public userInviter;

    // ═══════════════════════════════════════════════════════════════
    // STAKING — constants (not in storage)
    // ═══════════════════════════════════════════════════════════════

    /// @notice 1 token (1e18 wei) staked for 1 second = 1 point.
    uint256 public constant POINTS_DENOMINATOR = 1e18;

    // ═══════════════════════════════════════════════════════════════
    // STAKING — structs (no storage impact)
    // ═══════════════════════════════════════════════════════════════

    struct StakerInfo {
        uint256 stakedAmount;   // currently staked (wei)
        uint256 snapshotPoints; // points banked up to lastUpdateTime
        uint256 lastUpdateTime; // block.timestamp at last action
    }

    // ═══════════════════════════════════════════════════════════════
    // STAKING — storage (appended after streaming state)
    // ═══════════════════════════════════════════════════════════════

    IERC20 public stakingToken;
    mapping(address => StakerInfo) public stakers;
    uint256 public totalStaked;
    uint256 public totalPointsIssued;

    // ═══════════════════════════════════════════════════════════════
    // PHONE MAPPING — storage (appended for upgrade safety)
    // ═══════════════════════════════════════════════════════════════

    /// @dev phone hash (normalized E.164 hash) => wallet address
    mapping(bytes32 => address) private _phoneToAddress;
    /// @dev wallet address => phone hash (normalized E.164 hash)
    mapping(address => bytes32) private _addressToPhone;
    /// @dev wallet address => encrypted phone payload (ciphertext metadata + bytes)
    mapping(address => bytes) private _addressToEncryptedPhone;

    /// @dev Reserved for future upgrades — do not use.
    uint256[45] private __gap;

    // ═══════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════

    event SuperfluidConfigUpdated(address indexed superToken, address indexed gdaForwarder);
    event Staked(address indexed staker, uint256 amount, uint256 totalStake, uint256 totalPoints);
    event Unstaked(address indexed staker, uint256 amount, uint256 totalStake, uint256 totalPoints);
    event PointsCheckpointed(address indexed staker, uint256 newSnapshot);
    event ExcessRecovered(address indexed to, uint256 amount);
    event PhoneMapped(bytes32 indexed phoneHash, address indexed user);
    event PhoneUnmapped(bytes32 indexed phoneHash, address indexed user);
    event PhoneEncryptedDataUpdated(address indexed user);

    // ═══════════════════════════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════════════════════════

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // ═══════════════════════════════════════════════════════════════
    // Initializers
    // ═══════════════════════════════════════════════════════════════

    /// @notice Streaming initializer — already called on the live proxy. Do not call again.
    function initialize(
        address _platformFeeRecipient,
        address _owner,
        address _superToken,
        address _gdaForwarder
    ) public initializer {
        require(_platformFeeRecipient != address(0), "DripCoreV3: invalid fee recipient");
        require(_owner != address(0), "DripCoreV3: invalid owner");
        require(_superToken != address(0), "DripCoreV3: invalid super token");
        require(_gdaForwarder != address(0), "DripCoreV3: invalid forwarder");

        __ReentrancyGuard_init();
        __Ownable_init(_owner);

        platformFeeRecipient = _platformFeeRecipient;
        platformFeeBps = 50;
        superToken = ISuperToken(_superToken);
        gdaForwarder = IGDAv1Forwarder(_gdaForwarder);
    }

    /// @notice Staking initializer — called via upgradeAndCall during the upgrade to V3.
    ///         reinitializer(2) ensures it runs exactly once (since initialize() set version=1).
    /// @param _token  ERC20 token accepted for staking (G$ on Celo)
    function initializeStaking(address _token) public reinitializer(2) {
        require(_token != address(0), "DripCoreV3: invalid staking token");
        stakingToken = IERC20(_token);
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — internal helpers
    // ═══════════════════════════════════════════════════════════════

    function _syncAccounting(uint256 streamId) internal {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        if (stream.streamId == 0) return;
        if (stream.status != StreamStatus.Active) {
            runtime.lastAccountingTimestamp = block.timestamp;
            return;
        }

        uint256 effectiveNow = block.timestamp;
        if (effectiveNow > stream.endTime) effectiveNow = stream.endTime;
        if (effectiveNow <= runtime.lastAccountingTimestamp) return;

        uint256 elapsed = effectiveNow - runtime.lastAccountingTimestamp;
        uint256 spent = elapsed * uint256(uint96(runtime.totalFlowRate));

        if (spent >= runtime.remainingBudget) {
            spent = runtime.remainingBudget;
            runtime.remainingBudget = 0;
        } else {
            runtime.remainingBudget -= spent;
        }

        runtime.totalDistributedAccounting += spent;
        runtime.lastAccountingTimestamp = effectiveNow;

        if (runtime.remainingBudget == 0 || effectiveNow >= stream.endTime) {
            gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, 0, "");
            stream.status = StreamStatus.Completed;
            emit StreamCompleted(streamId);
        }
    }

    function _requireRateUnlocked(Stream memory stream) internal view {
        require(stream.rateLockUntil <= block.timestamp, "DripCoreV3: rate locked");
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — write functions
    // ═══════════════════════════════════════════════════════════════

    function createStream(
        address[] calldata recipients,
        address token,
        uint256[] calldata amountsPerPeriod,
        uint256 periodSeconds,
        uint256 deposit,
        string calldata title,
        string calldata description
    ) external payable nonReentrant returns (uint256 streamId) {
        require(msg.value == 0, "DripCoreV3: native not supported");
        require(token == address(superToken), "DripCoreV3: token must be configured super token");
        require(recipients.length > 0, "DripCoreV3: recipients required");
        require(recipients.length == amountsPerPeriod.length, "DripCoreV3: mismatched arrays");
        require(deposit > 0, "DripCoreV3: invalid deposit");
        require(periodSeconds >= MIN_DURATION && periodSeconds <= MAX_DURATION, "DripCoreV3: invalid duration");
        require(bytes(title).length <= MAX_TITLE_LEN, "DripCoreV3: title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN, "DripCoreV3: description too long");

        uint256 totalPerPeriod;
        int256 totalFlowRateInt;
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "DripCoreV3: invalid recipient");
            require(recipient != msg.sender, "DripCoreV3: self recipient forbidden");
            require(!_isRecipientInStream[_streamIdCounter + 1][recipient], "DripCoreV3: duplicate recipient");
            require(amountsPerPeriod[i] > 0, "DripCoreV3: invalid amount");

            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            require(ratePerSecond > 0, "DripCoreV3: rate too small");

            totalPerPeriod += amountsPerPeriod[i];
            totalFlowRateInt += int256(ratePerSecond);
        }

        require(deposit >= totalPerPeriod, "DripCoreV3: insufficient deposit for period");
        require(totalFlowRateInt > 0 && totalFlowRateInt <= type(int96).max, "DripCoreV3: invalid total flow");

        uint256 fee = (deposit * platformFeeBps) / 10000;
        uint256 streamDeposit = deposit - fee;

        require(superToken.transferFrom(msg.sender, address(this), deposit), "DripCoreV3: transfer failed");
        if (fee > 0) {
            require(superToken.transfer(platformFeeRecipient, fee), "DripCoreV3: fee transfer failed");
        }

        streamId = ++_streamIdCounter;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + periodSeconds;

        (bool poolCreated, ISuperfluidPool pool) = gdaForwarder.createPool(
            address(superToken),
            address(this),
            PoolConfig({ transferabilityForUnitsOwner: false, distributionFromAnyAddress: true })
        );
        require(poolCreated, "DripCoreV3: pool creation failed");

        address[] memory recipientsArray = new address[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            recipientsArray[i] = recipient;

            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            _recipientRates[streamId][recipient] = ratePerSecond;
            _recipientLastWithdraw[streamId][recipient] = startTime;
            _isRecipientInStream[streamId][recipient] = true;
            _recipientStreams[recipient].push(streamId);

            require(pool.updateMemberUnits(recipient, uint128(ratePerSecond)), "DripCoreV3: unit update failed");
            emit RecipientAdded(streamId, recipient, amountsPerPeriod[i], ratePerSecond);
        }

        _streams[streamId] = Stream({
            streamId: streamId,
            sender: msg.sender,
            recipients: recipientsArray,
            token: token,
            deposit: streamDeposit,
            startTime: startTime,
            endTime: endTime,
            status: StreamStatus.Active,
            rateLockUntil: 0,
            title: title,
            description: description
        });

        _streamRuntime[streamId] = StreamRuntime({
            pool: pool,
            totalFlowRate: int96(totalFlowRateInt),
            remainingBudget: streamDeposit,
            totalDistributedAccounting: 0,
            lastAccountingTimestamp: startTime
        });

        _senderStreams[msg.sender].push(streamId);

        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), pool, int96(totalFlowRateInt), ""),
            "DripCoreV3: flow start failed"
        );

        emit StreamCreated(streamId, msg.sender, recipientsArray, token, streamDeposit, startTime, endTime, title, description);
    }

    function pauseStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreV3: unauthorized");
        require(stream.status == StreamStatus.Active, "DripCoreV3: stream not active");

        _syncAccounting(streamId);

        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), _streamRuntime[streamId].pool, 0, ""),
            "DripCoreV3: flow pause failed"
        );

        stream.status = StreamStatus.Paused;
        emit StreamPaused(streamId, msg.sender);
    }

    function resumeStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreV3: unauthorized");
        require(stream.status == StreamStatus.Paused, "DripCoreV3: stream not paused");
        require(runtime.remainingBudget > 0, "DripCoreV3: no remaining budget");
        require(block.timestamp < stream.endTime, "DripCoreV3: stream already ended");

        runtime.lastAccountingTimestamp = block.timestamp;
        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, runtime.totalFlowRate, ""),
            "DripCoreV3: flow resume failed"
        );

        stream.status = StreamStatus.Active;
        emit StreamResumed(streamId, msg.sender);
    }

    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreV3: unauthorized");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCoreV3: stream not cancellable"
        );

        _syncAccounting(streamId);

        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, 0, ""),
            "DripCoreV3: flow stop failed"
        );

        uint256 refundAmount = runtime.remainingBudget;
        runtime.remainingBudget = 0;
        stream.status = StreamStatus.Cancelled;

        if (refundAmount > 0) {
            require(superToken.transfer(stream.sender, refundAmount), "DripCoreV3: refund failed");
        }

        emit StreamCancelled(streamId, msg.sender, refundAmount);
    }

    function extendStream(
        uint256 streamId,
        uint256 newEndTime,
        uint256 depositAmount
    ) external payable nonReentrant {
        require(msg.value == 0, "DripCoreV3: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender, "DripCoreV3: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCoreV3: stream immutable"
        );

        _syncAccounting(streamId);

        if (depositAmount > 0) {
            require(superToken.transferFrom(msg.sender, address(this), depositAmount), "DripCoreV3: deposit transfer failed");
            runtime.remainingBudget += depositAmount;
            stream.deposit += depositAmount;
        }

        if (newEndTime > stream.endTime) {
            stream.endTime = newEndTime;
        }

        emit StreamExtended(streamId, stream.endTime, depositAmount);
    }

    function addRecipient(
        uint256 streamId,
        address recipient,
        uint256 amountPerPeriod,
        uint256 additionalDeposit
    ) external payable nonReentrant {
        require(msg.value == 0, "DripCoreV3: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender, "DripCoreV3: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCoreV3: stream immutable"
        );
        require(recipient != address(0) && recipient != stream.sender, "DripCoreV3: invalid recipient");
        require(!_isRecipientInStream[streamId][recipient], "DripCoreV3: recipient exists");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "DripCoreV3: invalid period");

        uint256 ratePerSecond = amountPerPeriod / periodSeconds;
        require(ratePerSecond > 0, "DripCoreV3: rate too small");

        address[] memory oldRecipients = stream.recipients;
        address[] memory newRecipients = new address[](oldRecipients.length + 1);
        for (uint256 i = 0; i < oldRecipients.length; i++) {
            newRecipients[i] = oldRecipients[i];
        }
        newRecipients[oldRecipients.length] = recipient;
        stream.recipients = newRecipients;

        _isRecipientInStream[streamId][recipient] = true;
        _recipientRates[streamId][recipient] = ratePerSecond;
        _recipientLastWithdraw[streamId][recipient] = block.timestamp;
        _recipientStreams[recipient].push(streamId);

        require(runtime.pool.updateMemberUnits(recipient, uint128(ratePerSecond)), "DripCoreV3: unit update failed");

        int96 newFlowRate = runtime.totalFlowRate + int96(int256(ratePerSecond));
        runtime.totalFlowRate = newFlowRate;

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "DripCoreV3: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        if (stream.status == StreamStatus.Active) {
            require(
                gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, newFlowRate, ""),
                "DripCoreV3: flow update failed"
            );
        }

        emit RecipientAdded(streamId, recipient, amountPerPeriod, ratePerSecond);
    }

    function removeRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender, "DripCoreV3: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCoreV3: stream immutable"
        );
        require(_isRecipientInStream[streamId][recipient], "DripCoreV3: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 rate = _recipientRates[streamId][recipient];
        _recipientRates[streamId][recipient] = 0;
        _isRecipientInStream[streamId][recipient] = false;

        require(runtime.pool.updateMemberUnits(recipient, 0), "DripCoreV3: unit clear failed");
        runtime.totalFlowRate = runtime.totalFlowRate - int96(int256(rate));

        address[] memory oldRecipients = stream.recipients;
        uint256 n = oldRecipients.length;
        address[] memory compact = new address[](n - 1);
        uint256 k = 0;
        for (uint256 i = 0; i < n; i++) {
            if (oldRecipients[i] != recipient) {
                compact[k++] = oldRecipients[i];
            }
        }
        stream.recipients = compact;

        if (stream.status == StreamStatus.Active) {
            require(
                gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, runtime.totalFlowRate, ""),
                "DripCoreV3: flow update failed"
            );
        }

        emit RecipientRemoved(streamId, recipient, 0);
    }

    function updateRecipientRate(
        uint256 streamId,
        address recipient,
        uint256 newAmountPerPeriod,
        uint256 additionalDeposit
    ) external payable nonReentrant {
        require(msg.value == 0, "DripCoreV3: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender, "DripCoreV3: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCoreV3: stream immutable"
        );
        require(_isRecipientInStream[streamId][recipient], "DripCoreV3: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "DripCoreV3: invalid period");

        uint256 oldRate = _recipientRates[streamId][recipient];
        uint256 newRate = newAmountPerPeriod / periodSeconds;
        require(newRate > 0, "DripCoreV3: rate too small");

        _recipientRates[streamId][recipient] = newRate;
        require(runtime.pool.updateMemberUnits(recipient, uint128(newRate)), "DripCoreV3: unit update failed");
        runtime.totalFlowRate = runtime.totalFlowRate - int96(int256(oldRate)) + int96(int256(newRate));

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "DripCoreV3: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        if (stream.status == StreamStatus.Active) {
            require(
                gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, runtime.totalFlowRate, ""),
                "DripCoreV3: flow update failed"
            );
        }

        emit RecipientRateUpdated(streamId, recipient, oldRate, newRate);
    }

    function withdrawFromStream(uint256 streamId, address recipient) external nonReentrant returns (uint256 withdrawn) {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(_isRecipientInStream[streamId][recipient], "DripCoreV3: recipient not in stream");
        require(msg.sender == recipient, "DripCoreV3: only recipient can withdraw");
        require(
            stream.status == StreamStatus.Active ||
            stream.status == StreamStatus.Paused ||
            stream.status == StreamStatus.Completed,
            "DripCoreV3: stream not withdrawable"
        );

        _syncAccounting(streamId);

        uint256 beforeBal = superToken.balanceOf(recipient);
        require(_streamRuntime[streamId].pool.claimAll(recipient), "DripCoreV3: claim failed");
        uint256 afterBal = superToken.balanceOf(recipient);
        withdrawn = afterBal > beforeBal ? afterBal - beforeBal : 0;

        if (withdrawn > 0) {
            _recipientTotalWithdrawn[streamId][recipient] += withdrawn;
            _recipientLastWithdraw[streamId][recipient] = block.timestamp;
            emit StreamWithdrawn(streamId, recipient, withdrawn);
        }
    }

    function lockStreamRate(uint256 streamId, uint256 lockDuration) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreV3: unauthorized");
        stream.rateLockUntil = block.timestamp + lockDuration;
        emit StreamRateLocked(streamId, stream.rateLockUntil);
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — view functions
    // ═══════════════════════════════════════════════════════════════

    function getStream(uint256 streamId) external view returns (Stream memory stream) {
        stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreV3: stream not found");
    }

    /// @notice Returns the Superfluid GDA pool address for a stream.
    ///         Recipients can call gdaForwarder.connectPool(pool, "0x") with this
    ///         address to receive tokens in real-time instead of claiming manually.
    function getStreamPool(uint256 streamId) external view returns (address pool) {
        require(_streams[streamId].streamId != 0, "DripCoreV3: stream not found");
        pool = address(_streamRuntime[streamId].pool);
    }

    function getSenderStreams(address sender) external view returns (uint256[] memory streamIds) {
        return _senderStreams[sender];
    }

    function getRecipientStreams(address recipient) external view returns (uint256[] memory streamIds) {
        return _recipientStreams[recipient];
    }

    function getUserSentStreams(address user) external view returns (Stream[] memory streams) {
        uint256[] memory ids = _senderStreams[user];
        streams = new Stream[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            streams[i] = _streams[ids[i]];
        }
    }

    function getUserReceivedStreams(address user) external view returns (Stream[] memory streams) {
        uint256[] memory ids = _recipientStreams[user];
        streams = new Stream[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            streams[i] = _streams[ids[i]];
        }
    }

    function getRecipientBalance(uint256 streamId, address recipient) external view returns (uint256 balance) {
        Stream memory stream = _streams[streamId];
        if (stream.streamId == 0 || !_isRecipientInStream[streamId][recipient]) return 0;
        (int256 claimable, ) = _streamRuntime[streamId].pool.getClaimableNow(recipient);
        if (claimable <= 0) return 0;
        return uint256(claimable);
    }

    function getRecipientInfo(uint256 streamId, address recipient) external view returns (RecipientInfo memory info) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreV3: stream not found");
        require(_isRecipientInStream[streamId][recipient], "DripCoreV3: recipient not in stream");

        uint256 claimable;
        (int256 claimableSigned, ) = _streamRuntime[streamId].pool.getClaimableNow(recipient);
        if (claimableSigned > 0) claimable = uint256(claimableSigned);

        info = RecipientInfo({
            recipient: recipient,
            ratePerSecond: _recipientRates[streamId][recipient],
            totalWithdrawn: _recipientTotalWithdrawn[streamId][recipient],
            lastWithdrawTime: _recipientLastWithdraw[streamId][recipient],
            currentAccrued: claimable
        });
    }

    function getAllRecipientsInfo(uint256 streamId) external view returns (RecipientInfo[] memory recipients) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreV3: stream not found");

        recipients = new RecipientInfo[](stream.recipients.length);
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            uint256 claimable;
            (int256 claimableSigned, ) = _streamRuntime[streamId].pool.getClaimableNow(recipient);
            if (claimableSigned > 0) claimable = uint256(claimableSigned);
            recipients[i] = RecipientInfo({
                recipient: recipient,
                ratePerSecond: _recipientRates[streamId][recipient],
                totalWithdrawn: _recipientTotalWithdrawn[streamId][recipient],
                lastWithdrawTime: _recipientLastWithdraw[streamId][recipient],
                currentAccrued: claimable
            });
        }
    }

    function getContractBalances(address[] calldata tokens) external view returns (uint256[] memory balances) {
        balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) {
                balances[i] = address(this).balance;
            } else {
                balances[i] = ISuperToken(tokens[i]).balanceOf(address(this));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHONE MAPPING — write/view functions
    // ═══════════════════════════════════════════════════════════════

    /// @notice Register a phone hash to msg.sender.
    /// @dev Enforces one phone hash per address and one address per phone hash.
    ///      `phoneHash` should be produced from normalized E.164 input off-chain.
    function registerPhone(bytes32 phoneHash) external {
        require(phoneHash != bytes32(0), "DripCoreV3: invalid phone hash");
        require(_phoneToAddress[phoneHash] == address(0), "DripCoreV3: phone already mapped");
        require(_addressToPhone[msg.sender] == bytes32(0), "DripCoreV3: address already mapped");

        _phoneToAddress[phoneHash] = msg.sender;
        _addressToPhone[msg.sender] = phoneHash;

        emit PhoneMapped(phoneHash, msg.sender);
    }

    /// @notice Register phone hash and encrypted phone payload in one call.
    /// @dev `encryptedPhoneData` is expected to be client-encrypted bytes.
    function registerPhoneSecure(bytes32 phoneHash, bytes calldata encryptedPhoneData) external {
        require(phoneHash != bytes32(0), "DripCoreV3: invalid phone hash");
        require(encryptedPhoneData.length > 0, "DripCoreV3: encrypted phone required");
        require(_phoneToAddress[phoneHash] == address(0), "DripCoreV3: phone already mapped");
        require(_addressToPhone[msg.sender] == bytes32(0), "DripCoreV3: address already mapped");

        _phoneToAddress[phoneHash] = msg.sender;
        _addressToPhone[msg.sender] = phoneHash;
        _addressToEncryptedPhone[msg.sender] = encryptedPhoneData;

        emit PhoneMapped(phoneHash, msg.sender);
        emit PhoneEncryptedDataUpdated(msg.sender);
    }

    /// @notice Update encrypted phone payload for caller.
    /// @dev Useful for key rotation while preserving the same phone hash mapping.
    function updateEncryptedPhoneData(bytes calldata encryptedPhoneData) external {
        require(_addressToPhone[msg.sender] != bytes32(0), "DripCoreV3: no phone mapping");
        require(encryptedPhoneData.length > 0, "DripCoreV3: encrypted phone required");

        _addressToEncryptedPhone[msg.sender] = encryptedPhoneData;
        emit PhoneEncryptedDataUpdated(msg.sender);
    }

    /// @notice Remove caller's phone mapping.
    function unregisterPhone() external {
        bytes32 phoneHash = _addressToPhone[msg.sender];
        require(phoneHash != bytes32(0), "DripCoreV3: no phone mapping");

        delete _addressToPhone[msg.sender];
        delete _phoneToAddress[phoneHash];
        delete _addressToEncryptedPhone[msg.sender];

        emit PhoneUnmapped(phoneHash, msg.sender);
    }

    /// @notice Resolve a phone hash to wallet address.
    function resolveAddressByPhone(bytes32 phoneHash) external view returns (address user) {
        user = _phoneToAddress[phoneHash];
    }

    /// @notice Resolve a wallet address to its mapped phone hash.
    function resolvePhoneByAddress(address user) external view returns (bytes32 phoneHash) {
        phoneHash = _addressToPhone[user];
    }

    /// @notice Return encrypted phone payload for a mapped address.
    function getEncryptedPhoneByAddress(address user) external view returns (bytes memory encryptedPhoneData) {
        encryptedPhoneData = _addressToEncryptedPhone[user];
    }

    /// @notice Check whether a phone hash is already mapped.
    function isPhoneRegistered(bytes32 phoneHash) external view returns (bool) {
        return _phoneToAddress[phoneHash] != address(0);
    }

    /// @notice Check whether an address has already mapped a phone hash.
    function isAddressPhoneRegistered(address user) external view returns (bool) {
        return _addressToPhone[user] != bytes32(0);
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — admin
    // ═══════════════════════════════════════════════════════════════

    function setSuperfluidConfig(address _superToken, address _gdaForwarder) external onlyOwner {
        require(_superToken != address(0), "DripCoreV3: invalid super token");
        require(_gdaForwarder != address(0), "DripCoreV3: invalid forwarder");
        superToken = ISuperToken(_superToken);
        gdaForwarder = IGDAv1Forwarder(_gdaForwarder);
        emit SuperfluidConfigUpdated(_superToken, _gdaForwarder);
    }

    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "DripCoreV3: fee too high");
        platformFeeBps = newFeeBps;
    }

    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "DripCoreV3: invalid recipient");
        platformFeeRecipient = newRecipient;
    }

    function setEngagementRewards(address _engagementRewards) external onlyOwner {
        engagementRewards = _engagementRewards;
    }

    function setEngagementRewardsEnabled(bool _enabled) external onlyOwner {
        engagementRewardsEnabled = _enabled;
    }

    function setInviter(address inviter) external {
        if (inviter == address(0) || inviter == msg.sender) return;
        if (userInviter[msg.sender] == address(0)) {
            userInviter[msg.sender] = inviter;
        }
    }

    function claimEngagementReward(address, uint256, bytes calldata) external pure returns (bool) {
        return false;
    }

    function emergencyWithdrawAll(address[] calldata tokens, address payable to) external onlyOwner {
        require(to != address(0), "DripCoreV3: invalid recipient");
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) continue;
            uint256 bal = ISuperToken(tokens[i]).balanceOf(address(this));
            if (bal > 0) ISuperToken(tokens[i]).transfer(to, bal);
        }
        if (address(this).balance > 0) {
            (bool ok, ) = to.call{value: address(this).balance}("");
            require(ok, "DripCoreV3: native transfer failed");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STAKING — internal helpers
    // ═══════════════════════════════════════════════════════════════

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

    function _accruedSince(StakerInfo storage info) internal view returns (uint256) {
        if (info.stakedAmount == 0 || info.lastUpdateTime == 0) return 0;
        uint256 elapsed = block.timestamp - info.lastUpdateTime;
        return (info.stakedAmount * elapsed) / POINTS_DENOMINATOR;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAKING — write functions
    // ═══════════════════════════════════════════════════════════════

    /// @notice Stake tokens to start earning points.
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "DripCoreV3: amount must be > 0");
        require(address(stakingToken) != address(0), "DripCoreV3: staking not initialized");

        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount += amount;
        totalStaked += amount;

        require(stakingToken.transferFrom(msg.sender, address(this), amount), "DripCoreV3: stake transfer failed");

        emit Staked(msg.sender, amount, totalStaked, stakers[msg.sender].snapshotPoints);
    }

    /// @notice Unstake tokens. Accrued points are preserved.
    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "DripCoreV3: amount must be > 0");
        require(stakers[msg.sender].stakedAmount >= amount, "DripCoreV3: insufficient stake");

        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount -= amount;
        totalStaked -= amount;

        require(stakingToken.transfer(msg.sender, amount), "DripCoreV3: unstake transfer failed");

        emit Unstaked(msg.sender, amount, totalStaked, stakers[msg.sender].snapshotPoints);
    }

    /// @notice Manually checkpoint points without moving tokens.
    function checkpointPoints() external nonReentrant {
        _checkpointPoints(msg.sender);
    }

    /// @notice Emergency full unstake — banks all points then returns entire stake.
    function emergencyUnstake() external nonReentrant {
        uint256 amount = stakers[msg.sender].stakedAmount;
        require(amount > 0, "DripCoreV3: no stake");

        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount = 0;
        totalStaked -= amount;

        require(stakingToken.transfer(msg.sender, amount), "DripCoreV3: emergency unstake failed");

        emit Unstaked(msg.sender, amount, totalStaked, stakers[msg.sender].snapshotPoints);
    }

    /// @notice Owner can recover tokens sent to this contract that are not staking tokens or stream tokens.
    function recoverExcess(address tokenAddr, address to) external onlyOwner {
        require(to != address(0), "DripCoreV3: invalid recipient");
        uint256 bal;
        if (tokenAddr == address(stakingToken)) {
            // Only recover tokens above the staked balance
            bal = stakingToken.balanceOf(address(this));
            require(bal > totalStaked, "DripCoreV3: no excess");
            bal = bal - totalStaked;
        } else {
            bal = IERC20(tokenAddr).balanceOf(address(this));
            require(bal > 0, "DripCoreV3: no balance");
        }
        IERC20(tokenAddr).transfer(to, bal);
        emit ExcessRecovered(to, bal);
    }

    // ═══════════════════════════════════════════════════════════════
    // STAKING — view functions
    // ═══════════════════════════════════════════════════════════════

    /// @notice Live total points for a staker (banked + accruing since last checkpoint).
    function getPoints(address staker) external view returns (uint256 total) {
        StakerInfo storage info = stakers[staker];
        return info.snapshotPoints + _accruedSince(info);
    }

    /// @notice Full staker info: (stakedAmount, totalPoints, pointsPerSecond, lastUpdateTime).
    function getStakerInfo(address staker) external view returns (
        uint256 stakedAmount,
        uint256 totalPoints,
        uint256 pointsPerSecond,
        uint256 lastUpdateTime
    ) {
        StakerInfo storage info = stakers[staker];
        stakedAmount = info.stakedAmount;
        totalPoints = info.snapshotPoints + _accruedSince(info);
        pointsPerSecond = info.stakedAmount / POINTS_DENOMINATOR;
        lastUpdateTime = info.lastUpdateTime;
    }

    // ═══════════════════════════════════════════════════════════════
    // Fallback
    // ═══════════════════════════════════════════════════════════════

    receive() external payable {}
}
