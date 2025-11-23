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
        address recipient;          // Address receiving the stream
        address token;              // ERC20 token address (address(0) for native CELO)
        uint256 totalAmount;        // Total amount to be streamed
        uint256 startTime;          // Timestamp when stream starts
        uint256 endTime;            // Timestamp when stream ends
        uint256 ratePerSecond;      // Amount per second being streamed
        uint256 withdrawnAmount;    // Total amount withdrawn by recipient
        StreamStatus status;         // Current status of the stream
    }

    /// @notice Emitted when a new stream is created
    event StreamCreated(
        uint256 indexed streamId,
        address indexed sender,
        address indexed recipient,
        address token,
        uint256 totalAmount,
        uint256 startTime,
        uint256 endTime
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
     * @notice Create a new payment stream
     * @param recipient Address that will receive the streamed payments
     * @param token ERC20 token address (address(0) for native CELO)
     * @param totalAmount Total amount to be streamed
     * @param duration Duration of the stream in seconds
     * @return streamId Unique identifier for the created stream
     */
    function createStream(
        address recipient,
        address token,
        uint256 totalAmount,
        uint256 duration
    ) external payable returns (uint256 streamId);

    /**
     * @notice Get the current balance available for withdrawal
     * @param streamId The stream identifier
     * @return balance The amount available for withdrawal
     */
    function getStreamBalance(uint256 streamId) external view returns (uint256 balance);

    /**
     * @notice Withdraw available balance from a stream
     * @param streamId The stream identifier
     * @param amount The amount to withdraw (0 for maximum available)
     * @return withdrawn The amount actually withdrawn
     */
    function withdrawFromStream(uint256 streamId, uint256 amount) external returns (uint256 withdrawn);

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

