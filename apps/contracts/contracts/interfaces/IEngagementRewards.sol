// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IEngagementRewards
 * @notice Interface for Good Dollar Engagement Rewards contract
 * @dev Used for integrating engagement rewards into Drip contracts
 */
interface IEngagementRewards {
    /**
     * @notice Basic claim function for engagement rewards
     * @param user Address of the user claiming the reward
     * @param inviter Address of the inviter (can be address(0))
     * @param validUntilBlock Block number until which the signature is valid
     * @param signature User signature for first-time registration (can be empty bytes for subsequent claims)
     * @return success Whether the claim was successful
     */
    function appClaim(
        address user,
        address inviter,
        uint256 validUntilBlock,
        bytes memory signature
    ) external returns (bool success);

    /**
     * @notice Advanced claim function with custom reward percentages
     * @param user Address of the user claiming the reward
     * @param inviter Address of the inviter (can be address(0))
     * @param validUntilBlock Block number until which the signature is valid
     * @param signature User signature for first-time registration (can be empty bytes for subsequent claims)
     * @param userAndInviterPercentage Percentage split between user and inviter (0-100)
     * @param userPercentage Percentage that goes to user (0-100)
     * @return success Whether the claim was successful
     */
    function appClaim(
        address user,
        address inviter,
        uint256 validUntilBlock,
        bytes memory signature,
        uint8 userAndInviterPercentage,
        uint8 userPercentage
    ) external returns (bool success);
}

