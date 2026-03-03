// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IDrip.sol";

interface ISuperToken {
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

contract DripCoreSuperfluidCFA is IDrip, Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    uint256 public constant MIN_DURATION = 3600;
    uint256 public constant MAX_DURATION = 315360000;
    uint256 public constant MAX_TITLE_LEN = 120;
    uint256 public constant MAX_DESCRIPTION_LEN = 1024;

    struct StreamRuntime {
        int96 totalFlowRate;
        uint256 remainingBudget;
        uint256 totalDistributedAccounting;
        uint256 lastAccountingTimestamp;
    }

    uint256 private _streamIdCounter;

    mapping(uint256 => Stream) private _streams;
    mapping(uint256 => StreamRuntime) private _streamRuntime;

    mapping(uint256 => mapping(address => bool)) private _isRecipientInStream;
    mapping(uint256 => mapping(address => uint256)) private _recipientRates;
    mapping(uint256 => mapping(address => uint256)) private _recipientTotalStreamed;
    mapping(uint256 => mapping(address => uint256)) private _recipientStartTime;
    mapping(uint256 => mapping(address => bool)) private _isRecipientPaused;

    mapping(address => uint256[]) private _senderStreams;
    mapping(address => uint256[]) private _recipientStreams;

    uint256 public platformFeeBps;
    address public platformFeeRecipient;

    ISuperToken public superToken;
    ICFAv1Forwarder public cfaForwarder;

    address public engagementRewards;
    bool public engagementRewardsEnabled;
    mapping(address => address) public userInviter;

    event SuperfluidConfigUpdated(address indexed superToken, address indexed cfaForwarder);

    constructor() {}

    function initialize(
        address _platformFeeRecipient,
        address _owner,
        address _superToken,
        address _cfaForwarder
    ) public initializer {
        require(_platformFeeRecipient != address(0), "DripCoreCFA: invalid fee recipient");
        require(_owner != address(0), "DripCoreCFA: invalid owner");
        require(_superToken != address(0), "DripCoreCFA: invalid super token");
        require(_cfaForwarder != address(0), "DripCoreCFA: invalid forwarder");

        __ReentrancyGuard_init();
        __Ownable_init(_owner);

        platformFeeRecipient = _platformFeeRecipient;
        platformFeeBps = 50;
        superToken = ISuperToken(_superToken);
        cfaForwarder = ICFAv1Forwarder(_cfaForwarder);
    }

    function setSuperfluidConfig(address _superToken, address _cfaForwarder) external onlyOwner {
        require(_superToken != address(0), "DripCoreCFA: invalid super token");
        require(_cfaForwarder != address(0), "DripCoreCFA: invalid forwarder");
        superToken = ISuperToken(_superToken);
        cfaForwarder = ICFAv1Forwarder(_cfaForwarder);
        emit SuperfluidConfigUpdated(_superToken, _cfaForwarder);
    }

    function createStream(
        address[] calldata recipients,
        address token,
        uint256[] calldata amountsPerPeriod,
        uint256 periodSeconds,
        uint256 deposit,
        string calldata title,
        string calldata description
    ) external payable nonReentrant returns (uint256 streamId) {
        require(msg.value == 0, "DripCoreCFA: native not supported");
        require(token == address(superToken), "DripCoreCFA: token must be configured super token");
        require(recipients.length > 0, "DripCoreCFA: recipients required");
        require(recipients.length == amountsPerPeriod.length, "DripCoreCFA: mismatched arrays");
        require(deposit > 0, "DripCoreCFA: invalid deposit");
        require(periodSeconds >= MIN_DURATION && periodSeconds <= MAX_DURATION, "DripCoreCFA: invalid duration");
        require(bytes(title).length <= MAX_TITLE_LEN, "DripCoreCFA: title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN, "DripCoreCFA: description too long");

        uint256 totalPerPeriod;
        int256 totalFlowRateInt;
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "DripCoreCFA: invalid recipient");
            require(recipient != msg.sender, "DripCoreCFA: self recipient forbidden");
            require(!_isRecipientInStream[_streamIdCounter + 1][recipient], "DripCoreCFA: duplicate recipient");
            require(amountsPerPeriod[i] > 0, "DripCoreCFA: invalid amount");

            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            require(ratePerSecond > 0, "DripCoreCFA: rate too small");

            totalPerPeriod += amountsPerPeriod[i];
            totalFlowRateInt += int256(ratePerSecond);
        }

        require(deposit >= totalPerPeriod, "DripCoreCFA: insufficient deposit for period");
        require(totalFlowRateInt > 0 && totalFlowRateInt <= type(int96).max, "DripCoreCFA: invalid total flow");

        uint256 fee = (deposit * platformFeeBps) / 10000;
        uint256 streamDeposit = deposit - fee;

        require(superToken.transferFrom(msg.sender, address(this), deposit), "DripCoreCFA: transfer failed");
        if (fee > 0) {
            require(superToken.transfer(platformFeeRecipient, fee), "DripCoreCFA: fee transfer failed");
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
            _recipientStartTime[streamId][recipient] = startTime;
            _isRecipientInStream[streamId][recipient] = true;
            _recipientStreams[recipient].push(streamId);

            // Create individual CFA stream to this recipient
            require(
                cfaForwarder.createFlow(
                    address(superToken),
                    address(this),
                    recipient,
                    int96(int256(ratePerSecond)),
                    ""
                ),
                "DripCoreCFA: flow creation failed"
            );

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
            totalFlowRate: int96(totalFlowRateInt),
            remainingBudget: streamDeposit,
            totalDistributedAccounting: 0,
            lastAccountingTimestamp: startTime
        });

        _senderStreams[msg.sender].push(streamId);

        emit StreamCreated(streamId, msg.sender, recipientsArray, token, streamDeposit, startTime, endTime, title, description);
    }

    function _syncAccounting(uint256 streamId) internal {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        if (stream.streamId == 0) return;
        if (stream.status != StreamStatus.Active) {
            runtime.lastAccountingTimestamp = block.timestamp;
            return;
        }

        uint256 effectiveNow = block.timestamp;
        if (effectiveNow > stream.endTime) {
            effectiveNow = stream.endTime;
        }

        if (effectiveNow <= runtime.lastAccountingTimestamp) {
            return;
        }

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
            // Stop all flows
            for (uint256 i = 0; i < stream.recipients.length; i++) {
                address recipient = stream.recipients[i];
                if (_isRecipientInStream[streamId][recipient]) {
                    cfaForwarder.deleteFlow(address(superToken), address(this), recipient, "");
                }
            }
            stream.status = StreamStatus.Completed;
            emit StreamCompleted(streamId);
        }
    }

    function getRecipientBalance(uint256 streamId, address recipient) external view returns (uint256 balance) {
        Stream memory stream = _streams[streamId];
        if (stream.streamId == 0 || !_isRecipientInStream[streamId][recipient]) {
            return 0;
        }

        // CFA streams directly to recipient - calculate accrued amount
        uint256 rate = _recipientRates[streamId][recipient];
        if (rate == 0) return 0;
        
        uint256 startTime = _recipientStartTime[streamId][recipient];
        uint256 elapsed = block.timestamp > startTime ? block.timestamp - startTime : 0;
        return elapsed * rate;
    }

    function withdrawFromStream(uint256 streamId, address recipient) external nonReentrant returns (uint256 withdrawn) {
        // CFA automatically streams to recipient - this is a no-op for compatibility
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(_isRecipientInStream[streamId][recipient], "DripCoreCFA: recipient not in stream");
        require(msg.sender == recipient, "DripCoreCFA: only recipient can call");
        
        _syncAccounting(streamId);
        
        // No action needed - tokens already streaming to recipient
        // Return 0 since there's nothing to withdraw (already in their balance)
        return 0;
    }

    function getRecipientInfo(uint256 streamId, address recipient) external view returns (RecipientInfo memory info) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(_isRecipientInStream[streamId][recipient], "DripCoreCFA: recipient not in stream");

        uint256 rate = _recipientRates[streamId][recipient];
        uint256 startTime = _recipientStartTime[streamId][recipient];
        uint256 elapsed = block.timestamp > startTime ? block.timestamp - startTime : 0;
        uint256 totalStreamed = elapsed * rate;

        info = RecipientInfo({
            recipient: recipient,
            ratePerSecond: rate,
            totalWithdrawn: totalStreamed, // For CFA, this is total streamed
            lastWithdrawTime: block.timestamp, // Always current time for CFA
            currentAccrued: 0 // Always 0 since auto-streaming
        });
    }

    function getAllRecipientsInfo(uint256 streamId) external view returns (RecipientInfo[] memory recipients) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");

        recipients = new RecipientInfo[](stream.recipients.length);
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];

            uint256 rate = _recipientRates[streamId][recipient];
            uint256 startTime = _recipientStartTime[streamId][recipient];
            uint256 elapsed = block.timestamp > startTime ? block.timestamp - startTime : 0;
            uint256 totalStreamed = elapsed * rate;

            recipients[i] = RecipientInfo({
                recipient: recipient,
                ratePerSecond: rate,
                totalWithdrawn: totalStreamed,
                lastWithdrawTime: block.timestamp,
                currentAccrued: 0
            });
        }
    }

    function pauseStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreCFA: unauthorized");
        require(stream.status == StreamStatus.Active, "DripCoreCFA: stream not active");

        _syncAccounting(streamId);

        // Delete flows to pause (deleteFlow is the Superfluid way for forwarders)
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            if (_isRecipientInStream[streamId][recipient] && !_isRecipientPaused[streamId][recipient]) {
                require(
                    cfaForwarder.deleteFlow(address(superToken), address(this), recipient, ""),
                    "DripCoreCFA: flow deletion failed"
                );
                _isRecipientPaused[streamId][recipient] = true;
            }
        }

        stream.status = StreamStatus.Paused;
        emit StreamPaused(streamId, msg.sender);
    }

    function resumeStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreCFA: unauthorized");
        require(stream.status == StreamStatus.Paused, "DripCoreCFA: stream not paused");
        require(runtime.remainingBudget > 0, "DripCoreCFA: no remaining budget");
        require(block.timestamp < stream.endTime, "DripCoreCFA: stream already ended");

        runtime.lastAccountingTimestamp = block.timestamp;

        // Recreate flows to resume (createFlow after deleteFlow is the pattern for forwarders)
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            if (_isRecipientInStream[streamId][recipient] && _isRecipientPaused[streamId][recipient]) {
                uint256 rate = _recipientRates[streamId][recipient];
                require(
                    cfaForwarder.createFlow(
                        address(superToken),
                        address(this),
                        recipient,
                        int96(int256(rate)),
                        ""
                    ),
                    "DripCoreCFA: flow creation failed"
                );
                _isRecipientPaused[streamId][recipient] = false;
                _recipientStartTime[streamId][recipient] = block.timestamp;
            }
        }

        stream.status = StreamStatus.Active;
        emit StreamResumed(streamId, msg.sender);
    }

    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreCFA: unauthorized");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreCFA: stream not cancellable");

        _syncAccounting(streamId);

        // Delete all flows
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];
            if (_isRecipientInStream[streamId][recipient]) {
                cfaForwarder.deleteFlow(address(superToken), address(this), recipient, "");
            }
        }

        uint256 refundAmount = runtime.remainingBudget;
        runtime.remainingBudget = 0;

        stream.status = StreamStatus.Cancelled;

        if (refundAmount > 0) {
            require(superToken.transfer(stream.sender, refundAmount), "DripCoreCFA: refund failed");
        }

        emit StreamCancelled(streamId, msg.sender, refundAmount);
    }

    function pauseRecipient(uint256 streamId, address recipient) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreCFA: unauthorized");
        require(_isRecipientInStream[streamId][recipient], "DripCoreCFA: recipient not in stream");
        require(!_isRecipientPaused[streamId][recipient], "DripCoreCFA: already paused");
        require(stream.status == StreamStatus.Active, "DripCoreCFA: stream not active");

        _syncAccounting(streamId);

        // Delete flow to pause this recipient
        require(
            cfaForwarder.deleteFlow(address(superToken), address(this), recipient, ""),
            "DripCoreCFA: flow deletion failed"
        );

        _isRecipientPaused[streamId][recipient] = true;
        emit RecipientRemoved(streamId, recipient, 0); // Reuse event for now
    }

    function resumeRecipient(uint256 streamId, address recipient) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreCFA: unauthorized");
        require(_isRecipientInStream[streamId][recipient], "DripCoreCFA: recipient not in stream");
        require(_isRecipientPaused[streamId][recipient], "DripCoreCFA: not paused");
        require(stream.status == StreamStatus.Active, "DripCoreCFA: stream not active");

        _syncAccounting(streamId);

        uint256 rate = _recipientRates[streamId][recipient];
        require(rate > 0, "DripCoreCFA: invalid rate");

        // Recreate flow to resume this recipient
        require(
            cfaForwarder.createFlow(
                address(superToken),
                address(this),
                recipient,
                int96(int256(rate)),
                ""
            ),
            "DripCoreCFA: flow creation failed"
        );

        _isRecipientPaused[streamId][recipient] = false;
        _recipientStartTime[streamId][recipient] = block.timestamp; // Reset start time
        emit RecipientAdded(streamId, recipient, 0, rate); // Reuse event for now
    }

    function isRecipientPaused(uint256 streamId, address recipient) external view returns (bool) {
        return _isRecipientPaused[streamId][recipient];
    }

    function lockStreamRate(uint256 streamId, uint256 lockDuration) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreCFA: unauthorized");
        stream.rateLockUntil = block.timestamp + lockDuration;
        emit StreamRateLocked(streamId, stream.rateLockUntil);
    }

    function _requireRateUnlocked(Stream memory stream) internal view {
        require(stream.rateLockUntil <= block.timestamp, "DripCoreCFA: rate locked");
    }

    function extendStream(
        uint256 streamId,
        uint256 newEndTime,
        uint256 depositAmount
    ) external payable nonReentrant {
        require(msg.value == 0, "DripCoreCFA: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender, "DripCoreCFA: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreCFA: stream immutable");

        _syncAccounting(streamId);

        uint256 addedDeposit;
        if (depositAmount > 0) {
            require(superToken.transferFrom(msg.sender, address(this), depositAmount), "DripCoreCFA: deposit transfer failed");
            runtime.remainingBudget += depositAmount;
            stream.deposit += depositAmount;
            addedDeposit = depositAmount;
        }

        if (newEndTime > stream.endTime) {
            stream.endTime = newEndTime;
        }

        emit StreamExtended(streamId, stream.endTime, addedDeposit);
    }

    function addRecipient(
        uint256 streamId,
        address recipient,
        uint256 amountPerPeriod,
        uint256 additionalDeposit
    ) external payable nonReentrant {
        require(msg.value == 0, "DripCoreCFA: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender, "DripCoreCFA: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreCFA: stream immutable");
        require(recipient != address(0) && recipient != stream.sender, "DripCoreCFA: invalid recipient");
        require(!_isRecipientInStream[streamId][recipient], "DripCoreCFA: recipient exists");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "DripCoreCFA: invalid period");

        uint256 ratePerSecond = amountPerPeriod / periodSeconds;
        require(ratePerSecond > 0, "DripCoreCFA: rate too small");

        address[] memory oldRecipients = stream.recipients;
        address[] memory newRecipients = new address[](oldRecipients.length + 1);
        for (uint256 i = 0; i < oldRecipients.length; i++) {
            newRecipients[i] = oldRecipients[i];
        }
        newRecipients[oldRecipients.length] = recipient;
        stream.recipients = newRecipients;

        _isRecipientInStream[streamId][recipient] = true;
        _recipientRates[streamId][recipient] = ratePerSecond;
        _recipientStartTime[streamId][recipient] = block.timestamp;
        _recipientStreams[recipient].push(streamId);

        int96 newFlowRate = runtime.totalFlowRate + int96(int256(ratePerSecond));
        runtime.totalFlowRate = newFlowRate;

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "DripCoreCFA: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        if (stream.status == StreamStatus.Active) {
            require(
                cfaForwarder.createFlow(
                    address(superToken),
                    address(this),
                    recipient,
                    int96(int256(ratePerSecond)),
                    ""
                ),
                "DripCoreCFA: flow creation failed"
            );
        }

        emit RecipientAdded(streamId, recipient, amountPerPeriod, ratePerSecond);
    }

    function removeRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender, "DripCoreCFA: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreCFA: stream immutable");
        require(_isRecipientInStream[streamId][recipient], "DripCoreCFA: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 rate = _recipientRates[streamId][recipient];
        _recipientRates[streamId][recipient] = 0;
        _isRecipientInStream[streamId][recipient] = false;

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
                cfaForwarder.deleteFlow(address(superToken), address(this), recipient, ""),
                "DripCoreCFA: flow deletion failed"
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
        require(msg.value == 0, "DripCoreCFA: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreCFA: stream not found");
        require(stream.sender == msg.sender, "DripCoreCFA: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreCFA: stream immutable");
        require(_isRecipientInStream[streamId][recipient], "DripCoreCFA: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "DripCoreCFA: invalid period");

        uint256 oldRate = _recipientRates[streamId][recipient];
        uint256 newRate = newAmountPerPeriod / periodSeconds;
        require(newRate > 0, "DripCoreCFA: rate too small");

        _recipientRates[streamId][recipient] = newRate;

        runtime.totalFlowRate = runtime.totalFlowRate - int96(int256(oldRate)) + int96(int256(newRate));

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "DripCoreCFA: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        if (stream.status == StreamStatus.Active) {
            require(
                cfaForwarder.updateFlow(
                    address(superToken),
                    address(this),
                    recipient,
                    int96(int256(newRate)),
                    ""
                ),
                "DripCoreCFA: flow update failed"
            );
        }

        emit RecipientRateUpdated(streamId, recipient, oldRate, newRate);
    }

    function getStream(uint256 streamId) external view returns (Stream memory stream) {
        stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreCFA: stream not found");
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

    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "DripCoreCFA: fee too high");
        platformFeeBps = newFeeBps;
    }

    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "DripCoreCFA: invalid recipient");
        platformFeeRecipient = newRecipient;
    }

    function setEngagementRewards(address _engagementRewards) external onlyOwner {
        engagementRewards = _engagementRewards;
    }

    function setEngagementRewardsEnabled(bool _enabled) external onlyOwner {
        engagementRewardsEnabled = _enabled;
    }

    function setInviter(address inviter) external {
        if (inviter == address(0) || inviter == msg.sender) {
            return;
        }
        if (userInviter[msg.sender] == address(0)) {
            userInviter[msg.sender] = inviter;
        }
    }

    function claimEngagementReward(
        address,
        uint256,
        bytes calldata
    ) external pure returns (bool) {
        return false;
    }

    function emergencyWithdrawAll(address[] calldata tokens, address payable to) external onlyOwner {
        require(to != address(0), "DripCoreCFA: invalid recipient");
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            if (token == address(0)) {
                continue;
            }
            uint256 bal = ISuperToken(token).balanceOf(address(this));
            if (bal > 0) {
                ISuperToken(token).transfer(to, bal);
            }
        }
        if (address(this).balance > 0) {
            (bool ok, ) = to.call{value: address(this).balance}("");
            require(ok, "DripCoreCFA: native transfer failed");
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

    receive() external payable {}
}
