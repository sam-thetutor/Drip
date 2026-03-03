// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./interfaces/IDrip.sol";

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
}

contract DripCoreSuperfluid is IDrip, Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    uint256 public constant MIN_DURATION = 3600;
    uint256 public constant MAX_DURATION = 315360000;
    uint256 public constant MAX_TITLE_LEN = 120;
    uint256 public constant MAX_DESCRIPTION_LEN = 1024;

    struct StreamRuntime {
        ISuperfluidPool pool;
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

    event SuperfluidConfigUpdated(address indexed superToken, address indexed gdaForwarder);

    constructor() {}

    function initialize(
        address _platformFeeRecipient,
        address _owner,
        address _superToken,
        address _gdaForwarder
    ) public initializer {
        require(_platformFeeRecipient != address(0), "DripCoreSF: invalid fee recipient");
        require(_owner != address(0), "DripCoreSF: invalid owner");
        require(_superToken != address(0), "DripCoreSF: invalid super token");
        require(_gdaForwarder != address(0), "DripCoreSF: invalid forwarder");

        __ReentrancyGuard_init();
        __Ownable_init(_owner);

        platformFeeRecipient = _platformFeeRecipient;
        platformFeeBps = 50;
        superToken = ISuperToken(_superToken);
        gdaForwarder = IGDAv1Forwarder(_gdaForwarder);
    }

    function setSuperfluidConfig(address _superToken, address _gdaForwarder) external onlyOwner {
        require(_superToken != address(0), "DripCoreSF: invalid super token");
        require(_gdaForwarder != address(0), "DripCoreSF: invalid forwarder");
        superToken = ISuperToken(_superToken);
        gdaForwarder = IGDAv1Forwarder(_gdaForwarder);
        emit SuperfluidConfigUpdated(_superToken, _gdaForwarder);
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
        require(msg.value == 0, "DripCoreSF: native not supported");
        require(token == address(superToken), "DripCoreSF: token must be configured super token");
        require(recipients.length > 0, "DripCoreSF: recipients required");
        require(recipients.length == amountsPerPeriod.length, "DripCoreSF: mismatched arrays");
        require(deposit > 0, "DripCoreSF: invalid deposit");
        require(periodSeconds >= MIN_DURATION && periodSeconds <= MAX_DURATION, "DripCoreSF: invalid duration");
        require(bytes(title).length <= MAX_TITLE_LEN, "DripCoreSF: title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN, "DripCoreSF: description too long");

        uint256 totalPerPeriod;
        int256 totalFlowRateInt;
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            require(recipient != address(0), "DripCoreSF: invalid recipient");
            require(recipient != msg.sender, "DripCoreSF: self recipient forbidden");
            require(!_isRecipientInStream[_streamIdCounter + 1][recipient], "DripCoreSF: duplicate recipient");
            require(amountsPerPeriod[i] > 0, "DripCoreSF: invalid amount");

            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            require(ratePerSecond > 0, "DripCoreSF: rate too small");

            totalPerPeriod += amountsPerPeriod[i];
            totalFlowRateInt += int256(ratePerSecond);
        }

        require(deposit >= totalPerPeriod, "DripCoreSF: insufficient deposit for period");
        require(totalFlowRateInt > 0 && totalFlowRateInt <= type(int96).max, "DripCoreSF: invalid total flow");

        uint256 fee = (deposit * platformFeeBps) / 10000;
        uint256 streamDeposit = deposit - fee;

        require(superToken.transferFrom(msg.sender, address(this), deposit), "DripCoreSF: transfer failed");
        if (fee > 0) {
            require(superToken.transfer(platformFeeRecipient, fee), "DripCoreSF: fee transfer failed");
        }

        streamId = ++_streamIdCounter;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + periodSeconds;

        (bool poolCreated, ISuperfluidPool pool) = gdaForwarder.createPool(
            address(superToken),
            address(this),
            PoolConfig({
                transferabilityForUnitsOwner: false,
                distributionFromAnyAddress: true
            })
        );
        require(poolCreated, "DripCoreSF: pool creation failed");

        address[] memory recipientsArray = new address[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            recipientsArray[i] = recipient;

            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            _recipientRates[streamId][recipient] = ratePerSecond;
            _recipientLastWithdraw[streamId][recipient] = startTime;
            _isRecipientInStream[streamId][recipient] = true;
            _recipientStreams[recipient].push(streamId);

            require(pool.updateMemberUnits(recipient, uint128(ratePerSecond)), "DripCoreSF: unit update failed");

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
            "DripCoreSF: flow start failed"
        );

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
            gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, 0, "");
            stream.status = StreamStatus.Completed;
            emit StreamCompleted(streamId);
        }
    }

    function getRecipientBalance(uint256 streamId, address recipient) external view returns (uint256 balance) {
        Stream memory stream = _streams[streamId];
        if (stream.streamId == 0 || !_isRecipientInStream[streamId][recipient]) {
            return 0;
        }
        (int256 claimable, ) = _streamRuntime[streamId].pool.getClaimableNow(recipient);
        if (claimable <= 0) return 0;
        return uint256(claimable);
    }

    function withdrawFromStream(uint256 streamId, address recipient) external nonReentrant returns (uint256 withdrawn) {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(_isRecipientInStream[streamId][recipient], "DripCoreSF: recipient not in stream");
        require(msg.sender == recipient, "DripCoreSF: only recipient can withdraw");
        require(
            stream.status == StreamStatus.Active ||
            stream.status == StreamStatus.Paused ||
            stream.status == StreamStatus.Completed,
            "DripCoreSF: stream not withdrawable"
        );

        _syncAccounting(streamId);

        uint256 beforeBal = superToken.balanceOf(recipient);
        require(_streamRuntime[streamId].pool.claimAll(recipient), "DripCoreSF: claim failed");
        uint256 afterBal = superToken.balanceOf(recipient);
        withdrawn = afterBal > beforeBal ? afterBal - beforeBal : 0;

        if (withdrawn > 0) {
            _recipientTotalWithdrawn[streamId][recipient] += withdrawn;
            _recipientLastWithdraw[streamId][recipient] = block.timestamp;
            emit StreamWithdrawn(streamId, recipient, withdrawn);
        }
    }

    function getRecipientInfo(uint256 streamId, address recipient) external view returns (RecipientInfo memory info) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(_isRecipientInStream[streamId][recipient], "DripCoreSF: recipient not in stream");

        uint256 claimable;
        (int256 claimableSigned, ) = _streamRuntime[streamId].pool.getClaimableNow(recipient);
        if (claimableSigned > 0) {
            claimable = uint256(claimableSigned);
        }

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
        require(stream.streamId != 0, "DripCoreSF: stream not found");

        recipients = new RecipientInfo[](stream.recipients.length);
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            address recipient = stream.recipients[i];

            uint256 claimable;
            (int256 claimableSigned, ) = _streamRuntime[streamId].pool.getClaimableNow(recipient);
            if (claimableSigned > 0) {
                claimable = uint256(claimableSigned);
            }

            recipients[i] = RecipientInfo({
                recipient: recipient,
                ratePerSecond: _recipientRates[streamId][recipient],
                totalWithdrawn: _recipientTotalWithdrawn[streamId][recipient],
                lastWithdrawTime: _recipientLastWithdraw[streamId][recipient],
                currentAccrued: claimable
            });
        }
    }

    function pauseStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreSF: unauthorized");
        require(stream.status == StreamStatus.Active, "DripCoreSF: stream not active");

        _syncAccounting(streamId);

        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), _streamRuntime[streamId].pool, 0, ""),
            "DripCoreSF: flow pause failed"
        );

        stream.status = StreamStatus.Paused;
        emit StreamPaused(streamId, msg.sender);
    }

    function resumeStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreSF: unauthorized");
        require(stream.status == StreamStatus.Paused, "DripCoreSF: stream not paused");
        require(runtime.remainingBudget > 0, "DripCoreSF: no remaining budget");
        require(block.timestamp < stream.endTime, "DripCoreSF: stream already ended");

        runtime.lastAccountingTimestamp = block.timestamp;
        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, runtime.totalFlowRate, ""),
            "DripCoreSF: flow resume failed"
        );

        stream.status = StreamStatus.Active;
        emit StreamResumed(streamId, msg.sender);
    }

    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreSF: unauthorized");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreSF: stream not cancellable");

        _syncAccounting(streamId);

        require(
            gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, 0, ""),
            "DripCoreSF: flow stop failed"
        );

        uint256 refundAmount = runtime.remainingBudget;
        runtime.remainingBudget = 0;

        stream.status = StreamStatus.Cancelled;

        if (refundAmount > 0) {
            require(superToken.transfer(stream.sender, refundAmount), "DripCoreSF: refund failed");
        }

        emit StreamCancelled(streamId, msg.sender, refundAmount);
    }

    function lockStreamRate(uint256 streamId, uint256 lockDuration) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender || msg.sender == owner(), "DripCoreSF: unauthorized");
        stream.rateLockUntil = block.timestamp + lockDuration;
        emit StreamRateLocked(streamId, stream.rateLockUntil);
    }

    function _requireRateUnlocked(Stream memory stream) internal view {
        require(stream.rateLockUntil <= block.timestamp, "DripCoreSF: rate locked");
    }

    function extendStream(
        uint256 streamId,
        uint256 newEndTime,
        uint256 depositAmount
    ) external payable nonReentrant {
        require(msg.value == 0, "DripCoreSF: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender, "DripCoreSF: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreSF: stream immutable");

        _syncAccounting(streamId);

        uint256 addedDeposit;
        if (depositAmount > 0) {
            require(superToken.transferFrom(msg.sender, address(this), depositAmount), "DripCoreSF: deposit transfer failed");
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
        require(msg.value == 0, "DripCoreSF: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender, "DripCoreSF: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreSF: stream immutable");
        require(recipient != address(0) && recipient != stream.sender, "DripCoreSF: invalid recipient");
        require(!_isRecipientInStream[streamId][recipient], "DripCoreSF: recipient exists");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "DripCoreSF: invalid period");

        uint256 ratePerSecond = amountPerPeriod / periodSeconds;
        require(ratePerSecond > 0, "DripCoreSF: rate too small");

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

        require(runtime.pool.updateMemberUnits(recipient, uint128(ratePerSecond)), "DripCoreSF: unit update failed");

        int96 newFlowRate = runtime.totalFlowRate + int96(int256(ratePerSecond));
        runtime.totalFlowRate = newFlowRate;

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "DripCoreSF: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        if (stream.status == StreamStatus.Active) {
            require(
                gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, newFlowRate, ""),
                "DripCoreSF: flow update failed"
            );
        }

        emit RecipientAdded(streamId, recipient, amountPerPeriod, ratePerSecond);
    }

    function removeRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender, "DripCoreSF: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreSF: stream immutable");
        require(_isRecipientInStream[streamId][recipient], "DripCoreSF: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 rate = _recipientRates[streamId][recipient];
        _recipientRates[streamId][recipient] = 0;
        _isRecipientInStream[streamId][recipient] = false;

        require(runtime.pool.updateMemberUnits(recipient, 0), "DripCoreSF: unit clear failed");

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
                "DripCoreSF: flow update failed"
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
        require(msg.value == 0, "DripCoreSF: native not supported");
        Stream storage stream = _streams[streamId];
        StreamRuntime storage runtime = _streamRuntime[streamId];

        require(stream.streamId != 0, "DripCoreSF: stream not found");
        require(stream.sender == msg.sender, "DripCoreSF: only sender");
        require(stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused, "DripCoreSF: stream immutable");
        require(_isRecipientInStream[streamId][recipient], "DripCoreSF: recipient missing");
        _requireRateUnlocked(stream);

        _syncAccounting(streamId);

        uint256 periodSeconds = stream.endTime > stream.startTime ? (stream.endTime - stream.startTime) : 0;
        require(periodSeconds > 0, "DripCoreSF: invalid period");

        uint256 oldRate = _recipientRates[streamId][recipient];
        uint256 newRate = newAmountPerPeriod / periodSeconds;
        require(newRate > 0, "DripCoreSF: rate too small");

        _recipientRates[streamId][recipient] = newRate;
        require(runtime.pool.updateMemberUnits(recipient, uint128(newRate)), "DripCoreSF: unit update failed");

        runtime.totalFlowRate = runtime.totalFlowRate - int96(int256(oldRate)) + int96(int256(newRate));

        if (additionalDeposit > 0) {
            require(superToken.transferFrom(msg.sender, address(this), additionalDeposit), "DripCoreSF: add deposit failed");
            runtime.remainingBudget += additionalDeposit;
            stream.deposit += additionalDeposit;
        }

        if (stream.status == StreamStatus.Active) {
            require(
                gdaForwarder.distributeFlow(address(superToken), address(this), runtime.pool, runtime.totalFlowRate, ""),
                "DripCoreSF: flow update failed"
            );
        }

        emit RecipientRateUpdated(streamId, recipient, oldRate, newRate);
    }

    function getStream(uint256 streamId) external view returns (Stream memory stream) {
        stream = _streams[streamId];
        require(stream.streamId != 0, "DripCoreSF: stream not found");
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
        require(newFeeBps <= 1000, "DripCoreSF: fee too high");
        platformFeeBps = newFeeBps;
    }

    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "DripCoreSF: invalid recipient");
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
        require(to != address(0), "DripCoreSF: invalid recipient");
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
            require(ok, "DripCoreSF: native transfer failed");
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
