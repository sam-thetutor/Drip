// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStreamVault
 * @notice Interface DripV4 uses to communicate with per-stream vault clones.
 */
interface IStreamVault {
    /// @notice Called once immediately after clone deployment.
    function initialize(address factory, address owner) external;

    /**
     * @notice Open a CFA stream FROM this vault TO each recipient at the given rate.
     *         Loops through recipients and calls CFAv1Forwarder.setFlowrate() for each.
     *         Only callable by the factory (DripV4).
     */
    function startStreams(
        address token,
        address[] calldata recipients,
        int96[]   calldata flowRates
    ) external;

    /**
     * @notice Set flow rate to 0 for each recipient, stopping all streams.
     *         Superfluid returns the buffer to this vault per stream stopped.
     *         Gracefully skips any flow that was already liquidated.
     *         Only callable by the factory (DripV4).
     */
    function stopStreams(address token, address[] calldata recipients) external;

    /// @notice Transfer the entire token balance of this vault to `to`.
    ///         Only callable by the factory (DripV4).
    function refund(address token, address to) external;

    /// @notice Return current token balance held in this vault.
    function getBalance(address token) external view returns (uint256);

    /// @notice The DripV4 contract that deployed and controls this vault.
    function factory() external view returns (address);

    /// @notice The user who owns this vault (receives refunds).
    function owner() external view returns (address);
}
