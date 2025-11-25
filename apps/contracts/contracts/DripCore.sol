// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IDrip.sol";
import "./interfaces/IERC20.sol";
import "./utils/TokenHelper.sol";

/**
 * @title DripCore
 * @notice Main contract for payment streaming functionality with multiple recipients
 * @dev Implements per-second payment streaming with pause/resume/cancel capabilities
 */
contract DripCore is IDrip, ReentrancyGuard, Ownable {
    using TokenHelper for address;

    /// @notice Counter for generating unique stream IDs
    uint256 private _streamIdCounter;

    /// @notice Mapping from stream ID to stream data
    mapping(uint256 => Stream) private _streams;

    /// @notice Mapping from stream ID => recipient => rate per second
    mapping(uint256 => mapping(address => uint256)) private _recipientRates;

    /// @notice Mapping from stream ID => recipient => last withdrawal time
    mapping(uint256 => mapping(address => uint256)) private _recipientLastWithdraw;

    /// @notice Mapping from stream ID => recipient => total withdrawn
    mapping(uint256 => mapping(address => uint256)) private _recipientTotalWithdrawn;

    /// @notice Mapping from sender address to array of stream IDs they created
    mapping(address => uint256[]) private _senderStreams;

    /// @notice Mapping from recipient address to array of stream IDs they receive
    mapping(address => uint256[]) private _recipientStreams;

    /// @notice Mapping to track total paused time for each stream
    mapping(uint256 => uint256) private _pausedTime;
    
    /// @notice Mapping to track when stream was paused
    mapping(uint256 => uint256) private _pauseStartTime;

    /// @notice Minimum stream duration (1 hour)
    uint256 public constant MIN_DURATION = 3600;

    /// @notice Maximum stream duration (10 years)
    uint256 public constant MAX_DURATION = 315360000;

    /// @notice Maximum title length
    uint256 public constant MAX_TITLE_LEN = 120;

    /// @notice Maximum description length
    uint256 public constant MAX_DESCRIPTION_LEN = 1024;

    /// @notice Platform fee percentage (basis points, e.g., 50 = 0.5%)
    uint256 public platformFeeBps = 50; // 0.5% default

    /// @notice Platform fee recipient
    address public platformFeeRecipient;

    /**
     * @notice Constructor
     * @param _platformFeeRecipient Address to receive platform fees
     */
    constructor(address _platformFeeRecipient) Ownable(msg.sender) {
        require(_platformFeeRecipient != address(0), "DripCore: Invalid fee recipient");
        platformFeeRecipient = _platformFeeRecipient;
    }

    /**
     * @notice Create a new payment stream with multiple recipients
     * @param recipients Array of addresses that will receive the streamed payments
     * @param token ERC20 token address (address(0) for native CELO)
     * @param amountsPerPeriod Array of amounts per period for each recipient
     * @param periodSeconds Duration of the period in seconds
     * @param deposit Total amount to deposit
     * @param title Optional title for the stream
     * @param description Optional description
     * @return streamId Unique identifier for the created stream
     */
    function createStream(
        address[] calldata recipients,
        address token,
        uint256[] calldata amountsPerPeriod,
        uint256 periodSeconds,
        uint256 deposit,
        string calldata title,
        string calldata description
    ) external payable nonReentrant returns (uint256 streamId) {
        require(recipients.length > 0, "DripCore: At least one recipient required");
        require(recipients.length == amountsPerPeriod.length, "DripCore: Mismatched arrays");
        require(deposit > 0, "DripCore: Invalid deposit");
        require(periodSeconds >= MIN_DURATION, "DripCore: Period too short");
        require(periodSeconds <= MAX_DURATION, "DripCore: Period too long");
        require(bytes(title).length <= MAX_TITLE_LEN, "DripCore: Title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN, "DripCore: Description too long");

        // Check for duplicate recipients
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "DripCore: Invalid recipient");
            require(recipients[i] != msg.sender, "DripCore: Cannot stream to self");
            require(amountsPerPeriod[i] > 0, "DripCore: Invalid amount");
            for (uint256 j = i + 1; j < recipients.length; j++) {
                require(recipients[i] != recipients[j], "DripCore: Duplicate recipient");
            }
        }

        // Calculate platform fee
        uint256 fee = (deposit * platformFeeBps) / 10000;
        uint256 streamDeposit = deposit - fee;

        // Handle payment
        if (token == TokenHelper.NATIVE_TOKEN) {
            require(msg.value == deposit, "DripCore: Incorrect native amount");
            // Transfer fee to platform
            if (fee > 0) {
                (bool success, ) = platformFeeRecipient.call{value: fee}("");
                require(success, "DripCore: Fee transfer failed");
            }
        } else {
            require(msg.value == 0, "DripCore: Native token not expected");
            // Transfer tokens from sender
            require(
                TokenHelper.safeTransferFrom(token, msg.sender, address(this), streamDeposit),
                "DripCore: Token transfer failed"
            );
            // Transfer fee to platform
            if (fee > 0) {
                require(
                    TokenHelper.safeTransferFrom(token, msg.sender, platformFeeRecipient, fee),
                    "DripCore: Fee transfer failed"
                );
            }
        }

        // Create stream
        streamId = ++_streamIdCounter;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + periodSeconds;

        // Store recipients array
        uint256 recipientsLength = recipients.length;
        address[] memory recipientsArray = new address[](recipientsLength);
        for (uint256 i = 0; i < recipientsLength; i++) {
            recipientsArray[i] = recipients[i];
            // Calculate and store rate per second for each recipient
            uint256 ratePerSecond = amountsPerPeriod[i] / periodSeconds;
            require(ratePerSecond > 0, "DripCore: Rate too small");
            _recipientRates[streamId][recipients[i]] = ratePerSecond;
            // Initialize last withdraw time to start time
            _recipientLastWithdraw[streamId][recipients[i]] = startTime;
            // Initialize total withdrawn to 0
            _recipientTotalWithdrawn[streamId][recipients[i]] = 0;
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
            title: title,
            description: description
        });

        // Update mappings
        _senderStreams[msg.sender].push(streamId);
        for (uint256 i = 0; i < recipients.length; i++) {
            _recipientStreams[recipients[i]].push(streamId);
        }

        emit StreamCreated(streamId, msg.sender, recipientsArray, token, streamDeposit, startTime, endTime, title, description);

        return streamId;
    }

    /**
     * @notice Get the current balance available for withdrawal for a specific recipient
     * @param streamId The stream identifier
     * @param recipient The recipient address
     * @return balance The amount available for withdrawal
     */
    function getRecipientBalance(uint256 streamId, address recipient) external view returns (uint256 balance) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(_isRecipient(stream, recipient), "DripCore: Not a recipient");

        if (stream.status != StreamStatus.Active && stream.status != StreamStatus.Paused) {
            return 0;
        }

        uint256 ratePerSecond = _recipientRates[streamId][recipient];
        if (ratePerSecond == 0) {
            return 0;
        }

        uint256 currentTime = block.timestamp;
        uint256 lastWithdraw = _recipientLastWithdraw[streamId][recipient];
        if (lastWithdraw == 0) {
            lastWithdraw = stream.startTime;
        }

        // Calculate total paused time
        uint256 totalPausedTime = _pausedTime[streamId];
        if (stream.status == StreamStatus.Paused && _pauseStartTime[streamId] > 0) {
            totalPausedTime += (currentTime - _pauseStartTime[streamId]);
        }

        // Calculate elapsed time (excluding paused time)
        uint256 elapsedTime;
        if (currentTime > lastWithdraw) {
            uint256 rawElapsed = currentTime - lastWithdraw;
            // Adjust for paused time if pause occurred after last withdraw
            if (_pauseStartTime[streamId] > lastWithdraw && stream.status == StreamStatus.Paused) {
                uint256 pauseDuration = currentTime - _pauseStartTime[streamId];
                if (rawElapsed > pauseDuration) {
                    elapsedTime = rawElapsed - pauseDuration;
                } else {
                    elapsedTime = 0;
                }
            } else {
                elapsedTime = rawElapsed;
            }
        } else {
            elapsedTime = 0;
        }

        uint256 recipientAccrued = ratePerSecond * elapsedTime;

        // Calculate remaining deposit (considering all recipients)
        uint256 totalDistributed = _calculateTotalDistributed(streamId, currentTime);
        uint256 remainingDeposit = stream.deposit > totalDistributed ? stream.deposit - totalDistributed : 0;

        // Cap by remaining deposit
        if (recipientAccrued > remainingDeposit) {
            recipientAccrued = remainingDeposit;
        }

        balance = recipientAccrued;
        return balance;
    }

    /**
     * @notice Withdraw available balance from a stream (for a specific recipient)
     * @param streamId The stream identifier
     * @param recipient The recipient address withdrawing
     * @param amount The amount to withdraw (0 for maximum available)
     * @return withdrawn The amount actually withdrawn
     */
    function withdrawFromStream(
        uint256 streamId,
        address recipient,
        uint256 amount
    ) external nonReentrant returns (uint256 withdrawn) {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(stream.status == StreamStatus.Active, "DripCore: Stream not active");
        require(_isRecipient(stream, recipient), "DripCore: Not a recipient");
        require(msg.sender == recipient, "DripCore: Only recipient can withdraw");

        uint256 availableBalance = this.getRecipientBalance(streamId, recipient);
        require(availableBalance > 0, "DripCore: No balance available");

        if (amount == 0) {
            withdrawn = availableBalance;
        } else {
            require(amount <= availableBalance, "DripCore: Insufficient balance");
            withdrawn = amount;
        }

        // Update recipient tracking
        _recipientTotalWithdrawn[streamId][recipient] += withdrawn;
        _recipientLastWithdraw[streamId][recipient] = block.timestamp;

        // Transfer funds (dynamic token support - native CELO or ERC20)
        // TokenHelper.safeTransfer handles both token types automatically
        require(
            TokenHelper.safeTransfer(stream.token, recipient, withdrawn),
            "DripCore: Transfer failed"
        );

        // Check if stream deposit is exhausted
        uint256 totalDistributed = _calculateTotalDistributed(streamId, block.timestamp);
        if (totalDistributed >= stream.deposit) {
            stream.status = StreamStatus.Completed;
            emit StreamCompleted(streamId);
        }

        emit StreamWithdrawn(streamId, recipient, withdrawn);

        return withdrawn;
    }

    /**
     * @notice Get detailed information about a specific recipient in a stream
     * @param streamId The stream identifier
     * @param recipient The recipient address
     * @return info Recipient information structure
     */
    function getRecipientInfo(uint256 streamId, address recipient) external view returns (RecipientInfo memory info) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(_isRecipient(stream, recipient), "DripCore: Not a recipient");

        uint256 lastWithdraw = _recipientLastWithdraw[streamId][recipient];
        if (lastWithdraw == 0) {
            lastWithdraw = stream.startTime;
        }

        info = RecipientInfo({
            recipient: recipient,
            ratePerSecond: _recipientRates[streamId][recipient],
            totalWithdrawn: _recipientTotalWithdrawn[streamId][recipient],
            lastWithdrawTime: lastWithdraw,
            currentAccrued: this.getRecipientBalance(streamId, recipient)
        });

        return info;
    }

    /**
     * @notice Get information about all recipients in a stream
     * @param streamId The stream identifier
     * @return recipients Array of recipient information
     */
    function getAllRecipientsInfo(uint256 streamId) external view returns (RecipientInfo[] memory recipients) {
        Stream memory stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");

        recipients = new RecipientInfo[](stream.recipients.length);
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            recipients[i] = this.getRecipientInfo(streamId, stream.recipients[i]);
        }

        return recipients;
    }

    /**
     * @notice Pause an active stream
     * @param streamId The stream identifier
     */
    function pauseStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(stream.status == StreamStatus.Active, "DripCore: Stream not active");
        require(
            msg.sender == stream.sender || msg.sender == owner(),
            "DripCore: Unauthorized"
        );

        _pauseStartTime[streamId] = block.timestamp;
        stream.status = StreamStatus.Paused;
        emit StreamPaused(streamId, msg.sender);
    }

    /**
     * @notice Resume a paused stream
     * @param streamId The stream identifier
     */
    function resumeStream(uint256 streamId) external {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(stream.status == StreamStatus.Paused, "DripCore: Stream not paused");
        require(
            msg.sender == stream.sender || msg.sender == owner(),
            "DripCore: Unauthorized"
        );

        if (_pauseStartTime[streamId] > 0) {
            _pausedTime[streamId] += (block.timestamp - _pauseStartTime[streamId]);
            _pauseStartTime[streamId] = 0;
        }
        
        stream.status = StreamStatus.Active;
        emit StreamResumed(streamId, msg.sender);
    }

    /**
     * @notice Cancel a stream and refund remaining balance
     * @param streamId The stream identifier
     */
    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCore: Stream cannot be cancelled"
        );
        require(
            msg.sender == stream.sender || msg.sender == owner(),
            "DripCore: Unauthorized"
        );

        // Calculate remaining deposit
        uint256 totalDistributed = _calculateTotalDistributed(streamId, block.timestamp);
        uint256 refundAmount = stream.deposit > totalDistributed ? stream.deposit - totalDistributed : 0;

        stream.status = StreamStatus.Cancelled;
        stream.deposit = 0;

        // Refund remaining balance to sender (dynamic token support)
        // TokenHelper.safeTransfer handles both native CELO and ERC20 tokens
        if (refundAmount > 0) {
            // Verify contract has sufficient balance
            if (stream.token == TokenHelper.NATIVE_TOKEN) {
                require(address(this).balance >= refundAmount, "DripCore: Insufficient contract balance");
            } else {
                uint256 contractBalance = TokenHelper.getBalance(stream.token, address(this));
                require(contractBalance >= refundAmount, "DripCore: Insufficient contract balance");
            }
            
            require(
                TokenHelper.safeTransfer(stream.token, stream.sender, refundAmount),
                "DripCore: Refund failed"
            );
        }

        emit StreamCancelled(streamId, msg.sender, refundAmount);
    }

    /**
     * @notice Add a new recipient to an existing stream
     * @param streamId The stream identifier
     * @param recipient The new recipient address
     * @param amountPerPeriod The amount per period for the new recipient
     * @param additionalDeposit Additional deposit required to cover the new recipient
     */
    function addRecipient(
        uint256 streamId,
        address recipient,
        uint256 amountPerPeriod,
        uint256 additionalDeposit
    ) external payable nonReentrant {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCore: Stream not active or paused"
        );
        require(msg.sender == stream.sender, "DripCore: Only sender can modify recipients");
        require(recipient != address(0), "DripCore: Invalid recipient");
        require(recipient != msg.sender, "DripCore: Cannot stream to self");
        require(amountPerPeriod > 0, "DripCore: Invalid amount");
        require(!_isRecipient(stream, recipient), "DripCore: Recipient already exists");

        // Calculate rate per second
        uint256 periodSeconds = stream.endTime - stream.startTime;
        uint256 ratePerSecond = amountPerPeriod / periodSeconds;
        require(ratePerSecond > 0, "DripCore: Rate too small");

        // Calculate required additional deposit
        uint256 requiredDeposit = additionalDeposit;
        if (requiredDeposit > 0) {
            // Calculate platform fee
            uint256 fee = (requiredDeposit * platformFeeBps) / 10000;
            uint256 netDeposit = requiredDeposit - fee;

            // Handle payment
            if (stream.token == TokenHelper.NATIVE_TOKEN) {
                require(msg.value == requiredDeposit, "DripCore: Incorrect native amount");
                // Transfer fee to platform
                if (fee > 0) {
                    (bool success, ) = platformFeeRecipient.call{value: fee}("");
                    require(success, "DripCore: Fee transfer failed");
                }
            } else {
                require(msg.value == 0, "DripCore: Native token not expected");
                // Transfer tokens from sender
                require(
                    TokenHelper.safeTransferFrom(stream.token, msg.sender, address(this), netDeposit),
                    "DripCore: Token transfer failed"
                );
                // Transfer fee to platform
                if (fee > 0) {
                    require(
                        TokenHelper.safeTransferFrom(stream.token, msg.sender, platformFeeRecipient, fee),
                        "DripCore: Fee transfer failed"
                    );
                }
            }

            // Update stream deposit
            stream.deposit += netDeposit;
        }

        // Add recipient to array (need to create new array)
        address[] memory newRecipients = new address[](stream.recipients.length + 1);
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            newRecipients[i] = stream.recipients[i];
        }
        newRecipients[stream.recipients.length] = recipient;
        stream.recipients = newRecipients;

        // Store recipient rate and initialize tracking
        _recipientRates[streamId][recipient] = ratePerSecond;
        _recipientLastWithdraw[streamId][recipient] = stream.startTime;
        _recipientTotalWithdrawn[streamId][recipient] = 0;

        // Update recipient streams mapping
        _recipientStreams[recipient].push(streamId);

        emit RecipientAdded(streamId, recipient, amountPerPeriod, ratePerSecond);
    }

    /**
     * @notice Remove a recipient from an existing stream
     * @param streamId The stream identifier
     * @param recipient The recipient address to remove
     */
    function removeRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCore: Stream not active or paused"
        );
        require(msg.sender == stream.sender, "DripCore: Only sender can modify recipients");
        require(_isRecipient(stream, recipient), "DripCore: Recipient does not exist");

        // Calculate unaccrued deposit for this recipient
        uint256 ratePerSecond = _recipientRates[streamId][recipient];
        uint256 currentTime = block.timestamp;
        uint256 elapsedTime = currentTime > stream.startTime ? currentTime - stream.startTime : 0;
        
        // Account for paused time
        uint256 totalPausedTime = _pausedTime[streamId];
        if (stream.status == StreamStatus.Paused && _pauseStartTime[streamId] > 0) {
            totalPausedTime += (currentTime - _pauseStartTime[streamId]);
        }
        if (elapsedTime > totalPausedTime) {
            elapsedTime -= totalPausedTime;
        } else {
            elapsedTime = 0;
        }

        uint256 totalAccrued = ratePerSecond * elapsedTime;
        uint256 periodSeconds = stream.endTime - stream.startTime;
        uint256 totalAllocated = (ratePerSecond * periodSeconds);
        uint256 unaccruedDeposit = totalAllocated > totalAccrued ? totalAllocated - totalAccrued : 0;

        // Refund unaccrued deposit to sender
        if (unaccruedDeposit > 0 && stream.deposit >= unaccruedDeposit) {
            stream.deposit -= unaccruedDeposit;
            require(
                TokenHelper.safeTransfer(stream.token, stream.sender, unaccruedDeposit),
                "DripCore: Refund failed"
            );
        }

        // Remove recipient from array
        address[] memory newRecipients = new address[](stream.recipients.length - 1);
        uint256 newIndex = 0;
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            if (stream.recipients[i] != recipient) {
                newRecipients[newIndex] = stream.recipients[i];
                newIndex++;
            }
        }
        stream.recipients = newRecipients;

        // Clear recipient data
        delete _recipientRates[streamId][recipient];
        delete _recipientLastWithdraw[streamId][recipient];
        delete _recipientTotalWithdrawn[streamId][recipient];

        // Remove from recipient streams mapping (find and remove)
        uint256[] storage recipientStreams = _recipientStreams[recipient];
        for (uint256 i = 0; i < recipientStreams.length; i++) {
            if (recipientStreams[i] == streamId) {
                recipientStreams[i] = recipientStreams[recipientStreams.length - 1];
                recipientStreams.pop();
                break;
            }
        }

        emit RecipientRemoved(streamId, recipient, unaccruedDeposit);
    }

    /**
     * @notice Update a recipient's rate in an existing stream
     * @param streamId The stream identifier
     * @param recipient The recipient address
     * @param newAmountPerPeriod The new amount per period
     * @param additionalDeposit Additional deposit if increasing rate (0 if decreasing)
     */
    function updateRecipientRate(
        uint256 streamId,
        address recipient,
        uint256 newAmountPerPeriod,
        uint256 additionalDeposit
    ) external payable nonReentrant {
        Stream storage stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        require(
            stream.status == StreamStatus.Active || stream.status == StreamStatus.Paused,
            "DripCore: Stream not active or paused"
        );
        require(msg.sender == stream.sender, "DripCore: Only sender can modify recipients");
        require(_isRecipient(stream, recipient), "DripCore: Recipient does not exist");
        require(newAmountPerPeriod > 0, "DripCore: Invalid amount");

        uint256 oldRatePerSecond = _recipientRates[streamId][recipient];
        uint256 periodSeconds = stream.endTime - stream.startTime;
        uint256 newRatePerSecond = newAmountPerPeriod / periodSeconds;
        require(newRatePerSecond > 0, "DripCore: Rate too small");

        // Calculate difference in total allocation
        uint256 oldTotalAllocation = oldRatePerSecond * periodSeconds;
        uint256 newTotalAllocation = newRatePerSecond * periodSeconds;

        if (newTotalAllocation > oldTotalAllocation) {
            // Rate increased - need additional deposit
            uint256 requiredDeposit = newTotalAllocation - oldTotalAllocation;
            require(additionalDeposit >= requiredDeposit, "DripCore: Insufficient additional deposit");

            if (requiredDeposit > 0) {
                // Calculate platform fee
                uint256 fee = (requiredDeposit * platformFeeBps) / 10000;
                uint256 netDeposit = requiredDeposit - fee;

                // Handle payment
                if (stream.token == TokenHelper.NATIVE_TOKEN) {
                    require(msg.value == requiredDeposit, "DripCore: Incorrect native amount");
                    // Transfer fee to platform
                    if (fee > 0) {
                        (bool success, ) = platformFeeRecipient.call{value: fee}("");
                        require(success, "DripCore: Fee transfer failed");
                    }
                } else {
                    require(msg.value == 0, "DripCore: Native token not expected");
                    // Transfer tokens from sender
                    require(
                        TokenHelper.safeTransferFrom(stream.token, msg.sender, address(this), netDeposit),
                        "DripCore: Token transfer failed"
                    );
                    // Transfer fee to platform
                    if (fee > 0) {
                        require(
                            TokenHelper.safeTransferFrom(stream.token, msg.sender, platformFeeRecipient, fee),
                            "DripCore: Fee transfer failed"
                        );
                    }
                }

                stream.deposit += netDeposit;
            }
        } else {
            // Rate decreased - refund difference
            uint256 refundAmount = oldTotalAllocation - newTotalAllocation;
            if (refundAmount > 0 && stream.deposit >= refundAmount) {
                stream.deposit -= refundAmount;
                require(
                    TokenHelper.safeTransfer(stream.token, stream.sender, refundAmount),
                    "DripCore: Refund failed"
                );
            }
        }

        // Update recipient rate
        _recipientRates[streamId][recipient] = newRatePerSecond;

        emit RecipientRateUpdated(streamId, recipient, oldRatePerSecond, newRatePerSecond);
    }

    /**
     * @notice Get stream details
     * @param streamId The stream identifier
     * @return stream The stream structure
     */
    function getStream(uint256 streamId) external view returns (Stream memory stream) {
        stream = _streams[streamId];
        require(stream.streamId != 0, "DripCore: Stream does not exist");
        return stream;
    }

    /**
     * @notice Get all stream IDs for a sender
     * @param sender The sender address
     * @return streamIds Array of stream IDs
     */
    function getSenderStreams(address sender) external view returns (uint256[] memory streamIds) {
        return _senderStreams[sender];
    }

    /**
     * @notice Get all stream IDs for a recipient
     * @param recipient The recipient address
     * @return streamIds Array of stream IDs
     */
    function getRecipientStreams(address recipient) external view returns (uint256[] memory streamIds) {
        return _recipientStreams[recipient];
    }

    /**
     * @notice Get all streams where user is sender
     * @param user The user address
     * @return streams Array of stream structures
     */
    function getUserSentStreams(address user) external view returns (Stream[] memory streams) {
        uint256[] memory streamIds = _senderStreams[user];
        streams = new Stream[](streamIds.length);
        for (uint256 i = 0; i < streamIds.length; i++) {
            streams[i] = _streams[streamIds[i]];
        }
        return streams;
    }

    /**
     * @notice Get all streams where user is recipient
     * @param user The user address
     * @return streams Array of stream structures
     */
    function getUserReceivedStreams(address user) external view returns (Stream[] memory streams) {
        uint256[] memory streamIds = _recipientStreams[user];
        streams = new Stream[](streamIds.length);
        for (uint256 i = 0; i < streamIds.length; i++) {
            streams[i] = _streams[streamIds[i]];
        }
        return streams;
    }

    /**
     * @notice Update platform fee (owner only)
     * @param newFeeBps New fee in basis points
     */
    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "DripCore: Fee too high"); // Max 10%
        platformFeeBps = newFeeBps;
    }

    /**
     * @notice Update platform fee recipient (owner only)
     * @param newRecipient New fee recipient address
     */
    function setPlatformFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "DripCore: Invalid recipient");
        platformFeeRecipient = newRecipient;
    }

    /**
     * @notice Get the contract's total balance for a specific token
     * @dev Useful for checking contract's total escrow for a token type
     * @param token Token address (address(0) for native CELO)
     * @return balance The contract's balance for the token
     */
    function getContractBalance(address token) external view returns (uint256 balance) {
        return TokenHelper.getBalance(token, address(this));
    }

    /**
     * @notice Internal function to check if address is a recipient
     */
    function _isRecipient(Stream memory stream, address recipient) internal pure returns (bool) {
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            if (stream.recipients[i] == recipient) {
                return true;
            }
        }
        return false;
    }

    /**
     * @notice Internal function to calculate total distributed across all recipients
     */
    function _calculateTotalDistributed(uint256 streamId, uint256 currentTime) internal view returns (uint256) {
        Stream memory stream = _streams[streamId];
        if (stream.streamId == 0) return 0;

        uint256 totalOutflowRate = 0;
        for (uint256 i = 0; i < stream.recipients.length; i++) {
            totalOutflowRate += _recipientRates[streamId][stream.recipients[i]];
        }

        // Calculate total paused time
        uint256 totalPausedTime = _pausedTime[streamId];
        if (stream.status == StreamStatus.Paused && _pauseStartTime[streamId] > 0) {
            totalPausedTime += (currentTime - _pauseStartTime[streamId]);
        }

        uint256 elapsedFromStart = currentTime - stream.startTime;
        if (elapsedFromStart > totalPausedTime) {
            elapsedFromStart -= totalPausedTime;
        } else {
            elapsedFromStart = 0;
        }

        uint256 totalDistributed = totalOutflowRate * elapsedFromStart;
        
        // Cap by deposit
        if (totalDistributed > stream.deposit) {
            totalDistributed = stream.deposit;
        }

        return totalDistributed;
    }

    /**
     * @notice Receive native CELO
     */
    receive() external payable {
        // Allow contract to receive native CELO
    }
}
