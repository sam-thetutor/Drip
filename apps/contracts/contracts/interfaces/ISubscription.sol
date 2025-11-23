// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ISubscription
 * @notice Interface for the Drip subscription management contract
 * @dev Defines the core functionality for creating and managing recurring subscriptions
 */
interface ISubscription {
    /// @notice Subscription cadence enumeration
    enum Cadence {
        Daily,      // 1 day
        Weekly,      // 7 days
        Monthly,     // 30 days
        Custom       // Custom interval (specified in seconds)
    }

    /// @notice Subscription status enumeration
    enum SubscriptionStatus {
        Active,     // Subscription is active
        Paused,     // Subscription is paused
        Cancelled   // Subscription is cancelled
    }

    /// @notice Subscription structure
    struct Subscription {
        uint256 subscriptionId;      // Unique identifier for the subscription
        address subscriber;          // Address that created the subscription
        address recipient;           // Address receiving the payments
        address token;               // ERC20 token address (address(0) for native CELO)
        uint256 amount;              // Amount per payment
        Cadence cadence;             // Payment cadence
        uint256 interval;            // Custom interval in seconds (if cadence is Custom)
        uint256 nextPaymentTime;     // Timestamp of next scheduled payment
        uint256 lastPaymentTime;     // Timestamp of last payment
        uint256 totalPaid;           // Total amount paid so far
        uint256 paymentCount;        // Number of payments made
        SubscriptionStatus status;   // Current status of the subscription
    }

    /// @notice Payment record structure
    struct PaymentRecord {
        uint256 paymentId;           // Unique identifier for the payment
        uint256 subscriptionId;      // Associated subscription ID
        uint256 amount;              // Payment amount
        uint256 timestamp;            // Payment timestamp
        bool success;                // Whether payment was successful
    }

    /// @notice Emitted when a new subscription is created
    event SubscriptionCreated(
        uint256 indexed subscriptionId,
        address indexed subscriber,
        address indexed recipient,
        address token,
        uint256 amount,
        Cadence cadence,
        uint256 nextPaymentTime
    );

    /// @notice Emitted when a subscription payment is executed
    event PaymentExecuted(
        uint256 indexed subscriptionId,
        uint256 indexed paymentId,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );

    /// @notice Emitted when a subscription is paused
    event SubscriptionPaused(uint256 indexed subscriptionId, address indexed by);

    /// @notice Emitted when a subscription is resumed
    event SubscriptionResumed(uint256 indexed subscriptionId, address indexed by);

    /// @notice Emitted when a subscription is cancelled
    event SubscriptionCancelled(uint256 indexed subscriptionId, address indexed by);

    /// @notice Emitted when a subscription is modified
    event SubscriptionModified(
        uint256 indexed subscriptionId,
        uint256 newAmount,
        Cadence newCadence,
        uint256 newInterval
    );

    /**
     * @notice Create a new subscription
     * @param recipient Address that will receive the subscription payments
     * @param token ERC20 token address (address(0) for native CELO)
     * @param amount Amount per payment
     * @param cadence Payment cadence (Daily, Weekly, Monthly, or Custom)
     * @param customInterval Custom interval in seconds (only used if cadence is Custom)
     * @return subscriptionId Unique identifier for the created subscription
     */
    function createSubscription(
        address recipient,
        address token,
        uint256 amount,
        Cadence cadence,
        uint256 customInterval
    ) external payable returns (uint256 subscriptionId);

    /**
     * @notice Execute a subscription payment
     * @param subscriptionId The subscription identifier
     * @return success Whether the payment was successful
     * @return paymentId The payment record identifier
     */
    function executePayment(uint256 subscriptionId) external returns (bool success, uint256 paymentId);

    /**
     * @notice Execute multiple subscription payments in batch
     * @param subscriptionIds Array of subscription identifiers
     * @return successCount Number of successful payments
     */
    function executeBatchPayments(uint256[] calldata subscriptionIds) external returns (uint256 successCount);

    /**
     * @notice Pause an active subscription
     * @param subscriptionId The subscription identifier
     */
    function pauseSubscription(uint256 subscriptionId) external;

    /**
     * @notice Resume a paused subscription
     * @param subscriptionId The subscription identifier
     */
    function resumeSubscription(uint256 subscriptionId) external;

    /**
     * @notice Cancel a subscription
     * @param subscriptionId The subscription identifier
     */
    function cancelSubscription(uint256 subscriptionId) external;

    /**
     * @notice Modify an existing subscription
     * @param subscriptionId The subscription identifier
     * @param newAmount New payment amount
     * @param newCadence New payment cadence
     * @param newInterval New custom interval (only used if cadence is Custom)
     */
    function modifySubscription(
        uint256 subscriptionId,
        uint256 newAmount,
        Cadence newCadence,
        uint256 newInterval
    ) external;

    /**
     * @notice Get subscription details
     * @param subscriptionId The subscription identifier
     * @return subscription The subscription structure
     */
    function getSubscription(uint256 subscriptionId) external view returns (Subscription memory subscription);

    /**
     * @notice Get payment history for a subscription
     * @param subscriptionId The subscription identifier
     * @param offset Starting index for pagination
     * @param limit Maximum number of records to return
     * @return payments Array of payment records
     * @return total Total number of payments
     */
    function getPaymentHistory(
        uint256 subscriptionId,
        uint256 offset,
        uint256 limit
    ) external view returns (PaymentRecord[] memory payments, uint256 total);

    /**
     * @notice Check if a subscription payment is due
     * @param subscriptionId The subscription identifier
     * @return isDue Whether payment is due
     * @return nextPaymentTime Timestamp of next payment
     */
    function isPaymentDue(uint256 subscriptionId) external view returns (bool isDue, uint256 nextPaymentTime);
}

