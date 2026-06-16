// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title StreamVault
 * @notice Minimal per-stream vault. One vault is deployed (via EIP-1167 clone) for every
 *         stream created through DripV4.
 *
 * Design:
 *  - Holds Super Tokens deposited by DripV4 on behalf of the stream owner.
 *  - Opens / closes Superfluid CFA streams FROM itself TO each recipient.
 *  - Only the factory (DripV4) can issue instructions.
 *  - When a stream is cancelled or expires, DripV4 calls stopStreams() then refund(),
 *    which returns the remaining balance (including returned buffers) to the owner.
 *
 * Isolation guarantee:
 *  - Each vault is a unique address. Its token balance is fully independent of every
 *    other vault. Cross-stream contamination is impossible.
 */

interface ICFAv1Forwarder {
    function setFlowrate(address token, address receiver, int96 flowRate) external returns (bool);
}

interface IERC20Min {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract StreamVault {

    // ═══════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════

    address public constant CFA_FORWARDER = 0xcfA132E353cB4E398080B9700609bb008eceB125;

    // ═══════════════════════════════════════════
    // Storage
    // ═══════════════════════════════════════════

    address public factory;
    address public owner;
    bool    private _initialized;

    // ═══════════════════════════════════════════
    // Initializer
    // ═══════════════════════════════════════════

    function initialize(address _factory, address _owner) external {
        require(!_initialized,          "StreamVault: already initialized");
        require(_factory != address(0), "StreamVault: zero factory");
        require(_owner   != address(0), "StreamVault: zero owner");
        _initialized = true;
        factory      = _factory;
        owner        = _owner;
    }

    // ═══════════════════════════════════════════
    // Modifier
    // ═══════════════════════════════════════════

    modifier onlyFactory() {
        require(msg.sender == factory, "StreamVault: not factory");
        _;
    }

    // ═══════════════════════════════════════════
    // Stream control
    // ═══════════════════════════════════════════

    /**
     * @notice Open CFA streams FROM this vault TO each recipient.
     *         `recipients[i]` receives tokens at `flowRates[i]` wei/second.
     *         Superfluid deducts one buffer per stream from this vault's balance.
     */
    function startStreams(
        address          token,
        address[] calldata recipients,
        int96[]   calldata flowRates
    ) external onlyFactory {
        require(recipients.length == flowRates.length, "StreamVault: length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            bool ok = ICFAv1Forwarder(CFA_FORWARDER).setFlowrate(token, recipients[i], flowRates[i]);
            require(ok, "StreamVault: start flow failed");
        }
    }

    /**
     * @notice Stop all CFA streams to each recipient (set flow to 0).
     *         Superfluid returns each stream's buffer to this vault.
     *         Any flow that was already liquidated is gracefully skipped.
     */
    function stopStreams(address token, address[] calldata recipients) external onlyFactory {
        for (uint256 i = 0; i < recipients.length; i++) {
            // Use try/catch — if a flow was already liquidated, setFlowrate(0) would revert.
            try ICFAv1Forwarder(CFA_FORWARDER).setFlowrate(token, recipients[i], 0) {} catch {}
        }
    }

    /**
     * @notice Transfer the full token balance of this vault to `to`.
     *         Called by DripV4 after stopStreams() to return remaining funds to the owner.
     */
    function refund(address token, address to) external onlyFactory {
        uint256 bal = IERC20Min(token).balanceOf(address(this));
        if (bal > 0) {
            bool ok = IERC20Min(token).transfer(to, bal);
            require(ok, "StreamVault: refund failed");
        }
    }

    // ═══════════════════════════════════════════
    // View
    // ═══════════════════════════════════════════

    function getBalance(address token) external view returns (uint256) {
        return IERC20Min(token).balanceOf(address(this));
    }
}
