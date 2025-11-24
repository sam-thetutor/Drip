// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IDrip
 * @notice Interface for the Drip payment streaming contract
 * @dev Defines the core functionality for creating and managing payment streams
 */
interface IDrip {
    /// @notice Stream status enumeration
    enum StreamStatus {
        Pending,    // Stream created but not started
        Active,     // Stream is active and accruing
        Paused,     // Stream is paused
        Cancelled,  // Stream was cancelled
        Completed   // Stream completed naturally
    }

    /// @notice Stream structure
    struct Stream {
        uint256 streamId;           // Unique identifier for the stream
        address sender;             // Address that created the stream
        address[] recipients;       // Addresses receiving the stream (multiple recipients)
        address token;              // ERC20 token address (address(0) for native CELO)
        uint256 deposit;            // Total amount deposited (remaining is derived)
        uint256 startTime;          // Timestamp when stream starts
        uint256 endTime;            // Timestamp when stream ends (calculated from duration)
        StreamStatus status;         // Current status of the stream
        string title;               // Optional title (max 120 chars)
        string description;         // Optional description (max 1024 chars)
    }

    /// @notice Recipient information structure
    struct RecipientInfo {
        address recipient;          // Recipient address
        uint256 ratePerSecond;      // Rate per second for this recipient
        uint256 totalWithdrawn;      // Total amount withdrawn by this recipient
        uint256 lastWithdrawTime;   // Last withdrawal timestamp
        uint256 currentAccrued;     // Current accrued amount (not yet withdrawn)
    }

    /// @notice Emitted when a new stream is created
    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address[] recipients,
        address token,
        uint256 deposit,
        uint256 startTime,
        uint256 endTime,
        string title,
        string description
    );

    /// @notice Emitted when a stream is paused
    event StreamPaused(uint256 indexed streamId, address indexed by);

    /// @notice Emitted when a stream is resumed
    event StreamResumed(uint256 indexed streamId, address indexed by);

    /// @notice Emitted when a stream is cancelled
    event StreamCancelled(
        uint256 indexed streamId,
        address indexed by,
        uint256 refundAmount
    );

    /// @notice Emitted when funds are withdrawn from a stream
    event StreamWithdrawn(
        uint256 indexed streamId,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Emitted when a stream completes naturally
    event StreamCompleted(uint256 indexed streamId);

    /**
     * @notice Create a new payment stream with multiple recipients
     * @param recipients Array of addresses that will receive the streamed payments
     * @param token ERC20 token address (address(0) for native CELO)
     * @param amountsPerPeriod Array of amounts per period for each recipient (parallel to recipients)
     * @param periodSeconds Duration of the period in seconds (e.g., 30 days)
     * @param deposit Total amount to deposit (must cover all recipients)
     * @param title Optional title for the stream (max 120 chars)
     * @param description Optional description (max 1024 chars)
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
    ) external payable returns (uint256 streamId);

    /**
     * @notice Get the current balance available for withdrawal for a specific recipient
     * @param streamId The stream identifier
     * @param recipient The recipient address
     * @return balance The amount available for withdrawal
     */
    function getRecipientBalance(uint256 streamId, address recipient) external view returns (uint256 balance);

    /**
     * @notice Withdraw available balance from a stream (for a specific recipient)
     * @param streamId The stream identifier
     * @param recipient The recipient address withdrawing
     * @param amount The amount to withdraw (0 for maximum available)
     * @return withdrawn The amount actually withdrawn
     */
    function withdrawFromStream(uint256 streamId, address recipient, uint256 amount) external returns (uint256 withdrawn);

    /**
     * @notice Get detailed information about a specific recipient in a stream
     * @param streamId The stream identifier
     * @param recipient The recipient address
     * @return info Recipient information structure
     */
    function getRecipientInfo(uint256 streamId, address recipient) external view returns (RecipientInfo memory info);

    /**
     * @notice Get information about all recipients in a stream
     * @param streamId The stream identifier
     * @return recipients Array of recipient information
     */
    function getAllRecipientsInfo(uint256 streamId) external view returns (RecipientInfo[] memory recipients);

    /**
     * @notice Pause an active stream
     * @param streamId The stream identifier
     */
    function pauseStream(uint256 streamId) external;

    /**
     * @notice Resume a paused stream
     * @param streamId The stream identifier
     */
    function resumeStream(uint256 streamId) external;

    /**
     * @notice Cancel a stream and refund remaining balance
     * @param streamId The stream identifier
     */
    function cancelStream(uint256 streamId) external;

    /**
     * @notice Get stream details
     * @param streamId The stream identifier
     * @return stream The stream structure
     */
    function getStream(uint256 streamId) external view returns (Stream memory stream);
}

