// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IDrip.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// ─── Superfluid CFA interfaces ─────────────────────────────────────────────

interface ISuperTokenV4 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface ICFAv1Forwarder {
    function createFlow(
        address token,
        address sender,
        address receiver,
        int96 flowRate,
        bytes calldata userData
    ) external returns (bool);

    function updateFlow(
        address token,
        address sender,
        address receiver,
        int96 flowRate,
        bytes calldata userData
    ) external returns (bool);

    function deleteFlow(
        address token,
        address sender,
        address receiver,
        bytes calldata userData
    ) external returns (bool);

    function getFlowrate(
        address token,
        address sender,
        address receiver
    ) external view returns (int96 flowRate);
}

// Keep the GDA interfaces so storage types compile (needed for slot compatibility)
struct PoolConfig {
    bool transferabilityForUnitsOwner;
    bool distributionFromAnyAddress;
}

interface ISuperfluidPool {
    function updateMemberUnits(address memberAddr, uint128 newUnits) external returns (bool);
    function claimAll(address memberAddr) external returns (bool);
    function getClaimableNow(address memberAddr) external view returns (int256 claimableBalance, uint256 timestamp);
}

interface IGDAv1Forwarder {
    function createPool(address token, address admin, PoolConfig memory config) external returns (bool success, ISuperfluidPool pool);
    function distributeFlow(address token, address from, ISuperfluidPool pool, int96 requestedFlowRate, bytes calldata userData) external returns (bool success);
}

/**
 * @title DripCoreV4
 * @notice CFA-based streaming + G$ staking with points.
 *         Tokens stream directly into recipients' wallets via Superfluid CFA —
 *         no manual withdrawal required.
 *
 *         Designed to be deployed standalone first for testing, then later
 *         set as the new implementation behind the existing TransparentProxy
 *         at 0x5530975fDe062FE6706298fF3945E3d1a17A310a.
 *
 * Storage layout (CRITICAL — never reorder lines below):
 *   Slots 0-14  → identical to DripCoreV3 / DripCoreSuperfluid (streaming state)
 *   Slots 15-18 → staking state (same as V3)
 *   Slots 19-21 → new V4 state (CFA forwarder, recipient paused, aggregate flow rates)
 *   Slots 22-66 → __gap (reserved for future upgrades)
 */
contract DripCoreV4 is IDrip, Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — constants
    // ═══════════════════════════════════════════════════════════════

    uint256 public constant MIN_DURATION = 3600;
    uint256 public constant MAX_DURATION = 315360000;
    uint256 public constant MAX_TITLE_LEN = 120;
    uint256 public constant MAX_DESCRIPTION_LEN = 1024;

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — structs
    // ═══════════════════════════════════════════════════════════════

    struct StreamRuntime {
        ISuperfluidPool pool;               // slot kept for V3 compatibility (unused in V4)
        int96 totalFlowRate;
        uint256 remainingBudget;
        uint256 totalDistributedAccounting;
        uint256 lastAccountingTimestamp;
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — storage (slots 0-14, mirrors V3 exactly)
    // DO NOT reorder, insert, or remove any variable in this block.
    // ═══════════════════════════════════════════════════════════════

    uint256 private _streamIdCounter;                                        // slot 0
    mapping(uint256 => Stream) private _streams;                             // slot 1
    mapping(uint256 => StreamRuntime) private _streamRuntime;                // slot 2
    mapping(uint256 => mapping(address => bool)) private _isRecipientInStream; // slot 3
    mapping(uint256 => mapping(address => uint256)) private _recipientRates; // slot 4
    mapping(uint256 => mapping(address => uint256)) private _recipientTotalWithdrawn; // slot 5
    mapping(uint256 => mapping(address => uint256)) private _recipientLastWithdraw;   // slot 6
    mapping(address => uint256[]) private _senderStreams;                     // slot 7
    mapping(address => uint256[]) private _recipientStreams;                  // slot 8
    uint256 public platformFeeBps;                                           // slot 9
    address public platformFeeRecipient;                                     // slot 10
    ISuperTokenV4 public superToken;                                         // slot 11
    IGDAv1Forwarder public gdaForwarder;                                     // slot 12 (kept for layout)
    address public engagementRewards;                                        // slot 13
    bool public engagementRewardsEnabled;                                    // slot 13 (packed)
    mapping(address => address) public userInviter;                          // slot 14

    // ═══════════════════════════════════════════════════════════════
    // STAKING — constants
    // ═══════════════════════════════════════════════════════════════

    uint256 public constant POINTS_DENOMINATOR = 1e18;

    // ═══════════════════════════════════════════════════════════════
    // STAKING — structs
    // ═══════════════════════════════════════════════════════════════

    struct StakerInfo {
        uint256 stakedAmount;
        uint256 snapshotPoints;
        uint256 lastUpdateTime;
    }

    // ═══════════════════════════════════════════════════════════════
    // STAKING — storage (slots 15-18, same as V3)
    // ═══════════════════════════════════════════════════════════════

    IERC20 public stakingToken;                                              // slot 15
    mapping(address => StakerInfo) public stakers;                           // slot 16
    uint256 public totalStaked;                                              // slot 17
    uint256 public totalPointsIssued;                                        // slot 18

    // ═══════════════════════════════════════════════════════════════
    // V4 — new storage (slots 19-20, appended after V3)
    // ═══════════════════════════════════════════════════════════════

    ICFAv1Forwarder public cfaForwarder;                                     // slot 19
    mapping(uint256 => mapping(address => bool)) private _isRecipientPaused; // slot 20
    /// @dev Tracks the aggregate CFA flow rate from this contract to each recipient
    ///      across ALL active streams. CFA only allows one flow per sender→receiver pair,
    ///      so when a recipient appears in multiple streams we must aggregate.
    mapping(address => uint256) private _aggregateFlowRate;                   // slot 21

    /// @dev Reserved for future upgrades.
    uint256[45] private __gap;

    // ═══════════════════════════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════════════════════════

    event SuperfluidConfigUpdated(address indexed superToken, address indexed cfaForwarder);
    event Staked(address indexed staker, uint256 amount, uint256 totalStake, uint256 totalPoints);
    event Unstaked(address indexed staker, uint256 amount, uint256 totalStake, uint256 totalPoints);
    event PointsCheckpointed(address indexed staker, uint256 newSnapshot);
    event ExcessRecovered(address indexed to, uint256 amount);
    event RecipientPaused(uint256 indexed streamId, address indexed recipient);
    event RecipientResumed(uint256 indexed streamId, address indexed recipient);

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

    /// @notice Full initializer for standalone deployment (testing).
    function initialize(
        address _platformFeeRecipient,
        address _owner,
        address _superToken,
        address _cfaForwarder
    ) public initializer {
        require(_platformFeeRecipient != address(0), "V4: invalid fee recipient");
        require(_owner != address(0), "V4: invalid owner");
        require(_superToken != address(0), "V4: invalid super token");
        require(_cfaForwarder != address(0), "V4: invalid cfa forwarder");

        __ReentrancyGuard_init();
        __Ownable_init(_owner);

        platformFeeRecipient = _platformFeeRecipient;
        platformFeeBps = 50;
        superToken = ISuperTokenV4(_superToken);
        cfaForwarder = ICFAv1Forwarder(_cfaForwarder);
    }

    /// @notice Staking initializer — called via upgradeAndCall or separately.
    function initializeStaking(address _token) public reinitializer(2) {
        require(_token != address(0), "V4: invalid staking token");
        stakingToken = IERC20(_token);
    }

    /// @notice V4 CFA initializer — called when upgrading from V3.
    ///         Sets the CFA forwarder address. reinitializer(3) ensures it runs once.
    function initializeCFA(address _cfaForwarder) public reinitializer(3) {
        require(_cfaForwarder != address(0), "V4: invalid cfa forwarder");
        cfaForwarder = ICFAv1Forwarder(_cfaForwarder);
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
            // Stop all CFA flows for this stream's recipients
            for (uint256 i = 0; i < stream.recipients.length; i++) {
                address recipient = stream.recipients[i];
                if (_isRecipientInStream[streamId][recipient] && !_isRecipientPaused[streamId][recipient]) {
                    uint256 rate = _recipientRates[streamId][recipient];
                    _adjustFlow(recipient, -int256(rate));
                }
            }
            stream.status = StreamStatus.Completed;
            emit StreamCompleted(streamId);
        }
    }

    function _requireRateUnlocked(Stream memory stream) internal view {
        require(stream.rateLockUntil <= block.timestamp, "V4: rate locked");
    }

    /// @dev Adjusts the real CFA flow to `recipient` so it matches the aggregate
    ///      rate across all active streams.  Handles create / update / delete
    ///      automatically based on whether a flow already exists.
    ///      `rateChange` is the signed change (positive = add, negative = remove).
    function _adjustFlow(address recipient, int256 rateChange) internal {
        uint256 oldAgg = _aggregateFlowRate[recipient];
        uint256 newAgg;
        if (rateChange >= 0) {
            newAgg = oldAgg + uint256(rateChange);
        } else {
            uint256 decrease = uint256(-rateChange);
            newAgg = oldAgg > decrease ? oldAgg - decrease : 0;
        }
        _aggregateFlowRate[recipient] = newAgg;

        if (oldAgg == 0 && newAgg > 0) {
            // No existing flow → create
            require(
                cfaForwarder.createFlow(address(superToken), address(this), recipient, int96(int256(newAgg)), ""),
                "V4: flow creation failed"
            );
        } else if (oldAgg > 0 && newAgg == 0) {
            // Flow going to zero → delete
            require(
                cfaForwarder.deleteFlow(address(superToken), address(this), recipient, ""),
                "V4: flow deletion failed"
            );
        } else if (oldAgg > 0 && newAgg > 0 && oldAgg != newAgg) {
            // Flow rate changed → update
            require(
                cfaForwarder.updateFlow(address(superToken), address(this), recipient, int96(int256(newAgg)), ""),
                "V4: flow update failed"
            );
        }
        // else: no change needed (oldAgg == newAgg, or both 0)
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
        require(msg.value == 0, "V4: native not supported");
        require(token == address(superToken), "V4: token must be configured super token");
        require(recipients.length > 0, "V4: recipients required");
        require(recipients.length == amountsPerPeriod.length, "V4: mismatched arrays");
        require(deposit > 0, "V4: invalid deposit");
        require(periodSeconds >= MIN_DURATION && periodSeconds <= MAX_DURATION, "V4: invalid duration");
        require(bytes(title).length <= MAX_TITLE_LEN, "V4: title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN, "V4: description too long");

        uint256 totalPerPeriod;
        int256 totalFlowRateInt;
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "V4: invalid recipient");
            require(recipient != msg.sender, "V4: self recipient forbidden");
            require(!_isRecipientInStream[_streamIdCounter + 1][recipient], "V4: duplicate recipient");
            require(amountsPerPeriod[i] > 0, "V4: invalid amount");

            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            require(ratePerSecond > 0, "V4: rate too small");

            totalPerPeriod += amountsPerPeriod[i];
            totalFlowRateInt += int256(ratePerSecond);
        }

        require(deposit >= totalPerPeriod, "V4: insufficient deposit for period");
        require(totalFlowRateInt > 0 && totalFlowRateInt <= type(int96).max, "V4: invalid total flow");

        uint256 fee = (deposit * platformFeeBps) / 10000;
        uint256 streamDeposit = deposit - fee;

        require(superToken.transferFrom(msg.sender, address(this), deposit), "V4: transfer failed");
        if (fee > 0) {
            require(superToken.transfer(platformFeeRecipient, fee), "V4: fee transfer failed");
        }

        streamId = ++_streamIdCounter;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + periodSeconds;

        address[] memory recipientsArray = new address[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            recipientsArray[i] = recipient;

            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            _recipientRates[streamId][recipient] = ratePerSecond;
            _recipientLastWithdraw[streamId][recipient] = startTime;
            _isRecipientInStream[streamId][recipient] = true;
            _recipientStreams[recipient].push(streamId);

            // Create/update CFA flow directly to recipient's wallet
            _adjustFlow(recipient, int256(ratePerSecond));

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
            pool: ISuperfluidPool(address(0)),  // unused in V4
            totalFlowRate: int96(totalFlowRateInt),
            remainingBudget: streamDeposit,
            totalDistributedAccounting: 0,
            lastAccountingTimestamp: startTime
        });

        _senderStreams[msg.sender].push(streamId);

        emit StreamCreated(streamId, msg.sender, recipientsArray, token, streamDeposit, startTime, endTime, title, description);
    }

    function pauseStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "V4: unauthorized");
        require(stream.status == StreamStatus.Active, "V4: stream not active");

        _syncAccounting(streamId);

        // Reduce aggregate flows for all active recipients
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            if (_isRecipientInStream[streamId][recipient] && !_isRecipientPaused[streamId][recipient]) {
                uint256 rate = _recipientRates[streamId][recipient];
                _adjustFlow(recipient, -int256(rate));
                _isRecipientPaused[streamId][recipient] = true;
            }
        }

        stream.status = StreamStatus.Paused;
        emit StreamPaused(streamId, msg.sender);
    }

    function resumeStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "V4: unauthorized");
        require(stream.status == StreamStatus.Paused, "V4: stream not paused");
        require(runtime.remainingBudget > 0, "V4: no remaining budget");
        require(block.timestamp < stream.endTime, "V4: stream already ended");

        runtime.lastAccountingTimestamp = block.timestamp;

        // Restore aggregate flows for all paused recipients
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            if (_isRecipientInStream[streamId][recipient] && _isRecipientPaused[streamId][recipient]) {
                uint256 rate = _recipientRates[streamId][recipient];
                _adjustFlow(recipient, int256(rate));
                _isRecipientPaused[streamId][recipient] = false;
                _recipientLastWithdraw[streamId][recipient] = block.timestamp;
            }
        }

        stream.status = StreamStatus.Active;
        emit StreamResumed(streamId, msg.sender);
    }

    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "V4: unauthorized");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "V4: stream not cancellable"
        );

        _syncAccounting(streamId);

        // Reduce aggregate flows for all active recipients
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            if (_isRecipientInStream[streamId][recipient] && !_isRecipientPaused[streamId][recipient]) {
                uint256 rate = _recipientRates[streamId][recipient];
                _adjustFlow(recipient, -int256(rate));
            }
        }

        uint256 refundAmount = runtime.remainingBudget;
        runtime.remainingBudget = 0;
        stream.status = StreamStatus.Cancelled;

        if (refundAmount > 0) {
            require(superToken.transfer(stream.sender, refundAmount), "V4: refund failed");
        }

        emit StreamCancelled(streamId, msg.sender, refundAmount);
    }

    function extendStream(
        uint256 streamId,
        uint256 newEndTime,
        uint256 depositAmount
    ) external payable nonReentrant {
        require(msg.value == 0, "V4: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender, "V4: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "V4: stream immutable"
        );

        _syncAccounting(streamId);

        if (depositAmount > 0) {
            require(superToken.transferFrom(msg.sender, address(this), depositAmount), "V4: deposit transfer failed");
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
        require(msg.value == 0, "V4: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender, "V4: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "V4: stream immutable"
        );
        require(recipient != address(0) && recipient != stream.sender, "V4: invalid recipient");
        require(!_isRecipientInStream[streamId][recipient], "V4: recipient exists");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "V4: invalid period");

        uint256 ratePerSecond = amountPerPeriod / periodSeconds;
        require(ratePerSecond > 0, "V4: rate too small");

        // Expand recipients array
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

        int96 newFlowRate = runtime.totalFlowRate + int96(int256(ratePerSecond));
        runtime.totalFlowRate = newFlowRate;

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "V4: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        // Start CFA flow if stream is active
        if (stream.status == StreamStatus.Active) {
            _adjustFlow(recipient, int256(ratePerSecond));
        } else {
            // Stream is paused, mark recipient as paused too
            _isRecipientPaused[streamId][recipient] = true;
        }

        emit RecipientAdded(streamId, recipient, amountPerPeriod, ratePerSecond);
    }

    function removeRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender, "V4: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "V4: stream immutable"
        );
        require(_isRecipientInStream[streamId][recipient], "V4: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 rate = _recipientRates[streamId][recipient];
        _recipientRates[streamId][recipient] = 0;
        _isRecipientInStream[streamId][recipient] = false;

        runtime.totalFlowRate = runtime.totalFlowRate - int96(int256(rate));

        // Compact recipients array
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

        // Reduce aggregate flow if it was active
        if (stream.status == StreamStatus.Active && !_isRecipientPaused[streamId][recipient]) {
            _adjustFlow(recipient, -int256(rate));
        }

        _isRecipientPaused[streamId][recipient] = false;

        emit RecipientRemoved(streamId, recipient, 0);
    }

    function updateRecipientRate(
        uint256 streamId,
        address recipient,
        uint256 newAmountPerPeriod,
        uint256 additionalDeposit
    ) external payable nonReentrant {
        require(msg.value == 0, "V4: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender, "V4: only sender");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "V4: stream immutable"
        );
        require(_isRecipientInStream[streamId][recipient], "V4: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "V4: invalid period");

        uint256 oldRate = _recipientRates[streamId][recipient];
        uint256 newRate = newAmountPerPeriod / periodSeconds;
        require(newRate > 0, "V4: rate too small");

        _recipientRates[streamId][recipient] = newRate;
        runtime.totalFlowRate = runtime.totalFlowRate - int96(int256(oldRate)) + int96(int256(newRate));

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "V4: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        // Adjust aggregate flow if stream is active and recipient not paused
        if (stream.status == StreamStatus.Active && !_isRecipientPaused[streamId][recipient]) {
            int256 rateDelta = int256(newRate) - int256(oldRate);
            _adjustFlow(recipient, rateDelta);
        }

        emit RecipientRateUpdated(streamId, recipient, oldRate, newRate);
    }

    /// @notice Pause streaming to a single recipient without affecting others.
    function pauseRecipient(uint256 streamId, address recipient) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "V4: unauthorized");
        require(_isRecipientInStream[streamId][recipient], "V4: recipient not in stream");
        require(!_isRecipientPaused[streamId][recipient], "V4: already paused");
        require(stream.status == StreamStatus.Active, "V4: stream not active");

        _syncAccounting(streamId);

        uint256 rate = _recipientRates[streamId][recipient];
        _adjustFlow(recipient, -int256(rate));

        _isRecipientPaused[streamId][recipient] = true;
        emit RecipientPaused(streamId, recipient);
    }

    /// @notice Resume streaming to a previously paused recipient.
    function resumeRecipient(uint256 streamId, address recipient) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "V4: unauthorized");
        require(_isRecipientInStream[streamId][recipient], "V4: recipient not in stream");
        require(_isRecipientPaused[streamId][recipient], "V4: not paused");
        require(stream.status == StreamStatus.Active, "V4: stream not active");

        _syncAccounting(streamId);

        uint256 rate = _recipientRates[streamId][recipient];
        require(rate > 0, "V4: invalid rate");

        require(
            cfaForwarder.createFlow(
                address(superToken),
                address(this),
                recipient,
                int96(int256(rate)),
                ""
            ),
            "V4: flow creation failed"
        );

        _isRecipientPaused[streamId][recipient] = false;
        _recipientLastWithdraw[streamId][recipient] = block.timestamp;
        emit RecipientResumed(streamId, recipient);
    }

    /// @notice No-op for backward compatibility. CFA streams directly to wallets.
    function withdrawFromStream(uint256 streamId, address recipient) external nonReentrant returns (uint256 withdrawn) {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");
        require(_isRecipientInStream[streamId][recipient], "V4: recipient not in stream");
        require(msg.sender == recipient, "V4: only recipient can call");

        _syncAccounting(streamId);

        // Tokens already streaming directly to recipient via CFA — nothing to withdraw
        return 0;
    }

    function lockStreamRate(uint256 streamId, uint256 lockDuration) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "V4: unauthorized");
        stream.rateLockUntil = block.timestamp + lockDuration;
        emit StreamRateLocked(streamId, stream.rateLockUntil);
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — view functions
    // ═══════════════════════════════════════════════════════════════

    function getStream(uint256 streamId) external view returns (Stream memory stream) {
        stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");
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

        // CFA streams directly — calculate total streamed based on rate and elapsed time
        uint256 rate = _recipientRates[streamId][recipient];
        if (rate == 0) return 0;

        uint256 lastTime = _recipientLastWithdraw[streamId][recipient];
        uint256 effectiveNow = block.timestamp;
        if (effectiveNow > stream.endTime) effectiveNow = stream.endTime;

        uint256 elapsed = effectiveNow > lastTime ? effectiveNow - lastTime : 0;
        return elapsed * rate;
    }

    function getRecipientInfo(uint256 streamId, address recipient) external view returns (RecipientInfo memory info) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");
        require(_isRecipientInStream[streamId][recipient], "V4: recipient not in stream");

        uint256 rate = _recipientRates[streamId][recipient];
        uint256 lastTime = _recipientLastWithdraw[streamId][recipient];
        uint256 effectiveNow = block.timestamp;
        if (effectiveNow > stream.endTime) effectiveNow = stream.endTime;
        uint256 elapsed = effectiveNow > lastTime ? effectiveNow - lastTime : 0;
        uint256 totalStreamed = elapsed * rate;

        info = RecipientInfo({
            recipient: recipient,
            ratePerSecond: rate,
            totalWithdrawn: totalStreamed,
            lastWithdrawTime: lastTime,
            currentAccrued: 0  // Always 0 — tokens auto-delivered via CFA
        });
    }

    function getAllRecipientsInfo(uint256 streamId) external view returns (RecipientInfo[] memory recipients) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "V4: stream not found");

        recipients = new RecipientInfo[](stream.recipients.length);
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            uint256 rate = _recipientRates[streamId][recipient];
            uint256 lastTime = _recipientLastWithdraw[streamId][recipient];
            uint256 effectiveNow = block.timestamp;
            if (effectiveNow > stream.endTime) effectiveNow = stream.endTime;
            uint256 elapsed = effectiveNow > lastTime ? effectiveNow - lastTime : 0;
            uint256 totalStreamed = elapsed * rate;

            recipients[i] = RecipientInfo({
                recipient: recipient,
                ratePerSecond: rate,
                totalWithdrawn: totalStreamed,
                lastWithdrawTime: lastTime,
                currentAccrued: 0
            });
        }
    }

    function isRecipientPaused(uint256 streamId, address recipient) external view returns (bool) {
        return _isRecipientPaused[streamId][recipient];
    }

    function getContractBalances(address[] calldata tokens) external view returns (uint256[] memory balances) {
        balances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) {
                balances[i] = address(this).balance;
            } else {
                balances[i] = ISuperTokenV4(tokens[i]).balanceOf(address(this));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STREAMING — admin
    // ═══════════════════════════════════════════════════════════════

    function setSuperfluidConfig(address _superToken, address _cfaForwarder) external onlyOwner {
        require(_superToken != address(0), "V4: invalid super token");
        require(_cfaForwarder != address(0), "V4: invalid forwarder");
        superToken = ISuperTokenV4(_superToken);
        cfaForwarder = ICFAv1Forwarder(_cfaForwarder);
        emit SuperfluidConfigUpdated(_superToken, _cfaForwarder);
    }

    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "V4: fee too high");
        platformFeeBps = newFeeBps;
    }

    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "V4: invalid recipient");
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
        require(to != address(0), "V4: invalid recipient");
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == address(0)) continue;
            uint256 bal = ISuperTokenV4(tokens[i]).balanceOf(address(this));
            if (bal > 0) ISuperTokenV4(tokens[i]).transfer(to, bal);
        }
        if (address(this).balance > 0) {
            (bool ok, ) = to.call{value: address(this).balance}("");
            require(ok, "V4: native transfer failed");
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

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "V4: amount must be > 0");
        require(address(stakingToken) != address(0), "V4: staking not initialized");

        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount += amount;
        totalStaked += amount;

        require(stakingToken.transferFrom(msg.sender, address(this), amount), "V4: stake transfer failed");

        emit Staked(msg.sender, amount, totalStaked, stakers[msg.sender].snapshotPoints);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "V4: amount must be > 0");
        require(stakers[msg.sender].stakedAmount >= amount, "V4: insufficient stake");

        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount -= amount;
        totalStaked -= amount;

        require(stakingToken.transfer(msg.sender, amount), "V4: unstake transfer failed");

        emit Unstaked(msg.sender, amount, totalStaked, stakers[msg.sender].snapshotPoints);
    }

    function checkpointPoints() external nonReentrant {
        _checkpointPoints(msg.sender);
    }

    function emergencyUnstake() external nonReentrant {
        uint256 amount = stakers[msg.sender].stakedAmount;
        require(amount > 0, "V4: no stake");

        _checkpointPoints(msg.sender);
        stakers[msg.sender].stakedAmount = 0;
        totalStaked -= amount;

        require(stakingToken.transfer(msg.sender, amount), "V4: emergency unstake failed");

        emit Unstaked(msg.sender, amount, totalStaked, stakers[msg.sender].snapshotPoints);
    }

    function recoverExcess(address tokenAddr, address to) external onlyOwner {
        require(to != address(0), "V4: invalid recipient");
        uint256 bal;
        if (tokenAddr == address(stakingToken)) {
            bal = stakingToken.balanceOf(address(this));
            require(bal > totalStaked, "V4: no excess");
            bal = bal - totalStaked;
        } else {
            bal = IERC20(tokenAddr).balanceOf(address(this));
            require(bal > 0, "V4: no balance");
        }
        IERC20(tokenAddr).transfer(to, bal);
        emit ExcessRecovered(to, bal);
    }

    // ═══════════════════════════════════════════════════════════════
    // STAKING — view functions
    // ═══════════════════════════════════════════════════════════════

    function getPoints(address staker) external view returns (uint256 total) {
        StakerInfo storage info = stakers[staker];
        return info.snapshotPoints + _accruedSince(info);
    }

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
