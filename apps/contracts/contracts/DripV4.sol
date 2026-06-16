// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/IStreamVault.sol";

/**
 * @title DripV4
 * @notice On-chain registry and orchestrator for guaranteed, capped multi-recipient streams.
 *
 * Stream lifecycle:
 *   approve DripV4 → createStream() → ACTIVE  (all recipients receive immediately)
 *   → pauseStream()  → PAUSED   (flows stop, buffers returned)
 *   → resumeStream() → ACTIVE   (flows restart, endTime extended by pause duration)
 *   → cancelStream() → CANCELLED (stop all flows, refund vault to sender)
 *   OR keeper calls expireStream() when endTime passes → COMPLETED
 *
 * Key properties:
 *  - Every stream has its own vault — zero cross-stream contamination.
 *  - DripV4 never holds tokens; funds go vault → recipients in real-time.
 *  - Recipients receive automatically — no action needed from them.
 *  - Platform fee deducted from totalAmount at creation (sent directly to platformFeeRecipient).
 *  - Sender can lock stream (prevent cancel + pause) via lockStreamRate().
 */

interface ICFAv1Forwarder {
    function getFlowrate(address token, address sender, address receiver)
        external view returns (int96 flowRate);
}

interface IERC20Min {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract DripV4 {

    // ═══════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════

    address public constant CFA_FORWARDER = 0xcfA132E353cB4E398080B9700609bb008eceB125;

    uint256 public constant BUFFER_SECONDS      = 14_400;    // 4 hours — Celo liquidation period
    uint256 public constant MIN_DURATION        = 3_600;     // 1 hour minimum stream duration
    uint256 public constant MAX_DURATION        = 315_360_000; // 10 years maximum
    uint256 public constant MAX_TITLE_LEN       = 120;
    uint256 public constant MAX_DESCRIPTION_LEN = 1_024;
    uint256 public constant MAX_RECIPIENTS      = 50;
    uint256 public constant MAX_FEE_BPS         = 1_000;     // 10% hard cap on platform fee

    // ═══════════════════════════════════════════
    // Types
    // ═══════════════════════════════════════════

    enum StreamStatus { Active, Paused, Completed, Cancelled }

    struct Stream {
        uint256      streamId;
        address      sender;
        address[]    recipients;
        address      token;
        int96[]      flowRates;       // flowRates[i] → recipients[i]  (wei/s)
        int96        totalFlowRate;   // sum of all flowRates
        uint256      totalAmount;     // net wei to stream (after fee deduction)
        uint256      depositAmount;   // net totalAmount + buffer (what vault holds)
        address      vault;
        uint256      startTime;
        uint256      endTime;         // extended on resume to compensate for pauses
        uint256      finishTime;      // set when stream ends (0 while active/paused)
        uint256      pausedAt;        // timestamp of last pause (0 if active/never paused)
        uint256      rateLockUntil;   // cancel + pause blocked until this timestamp (0 = no lock)
        StreamStatus status;
        string       title;
        string       description;
    }

    // ═══════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════

    address public owner;
    address public vaultImplementation;

    uint256 public platformFeeBps;          // basis points, e.g. 50 = 0.5%
    address public platformFeeRecipient;    // receives the fee; no fee if address(0)

    uint256 private _idCounter;

    mapping(uint256 => Stream)        private _streams;
    mapping(address => uint256[])     private _senderStreams;
    mapping(address => uint256[])     private _recipientStreams;

    // Per-recipient state within a stream (independent of whole-stream status).
    // A recipient can be individually paused or permanently removed while other
    // recipients in the same vault continue receiving.
    mapping(uint256 => mapping(address => bool)) private _recipientPaused;
    mapping(uint256 => mapping(address => bool)) private _recipientRemoved;

    // Phone mapping
    mapping(bytes32 => address) private _phoneToAddress;
    mapping(address => bytes32) private _addressToPhone;
    mapping(address => bytes)   private _addressToEncryptedPhone;

    // ═══════════════════════════════════════════
    // Events
    // ═══════════════════════════════════════════

    event StreamCreated(
        uint256   indexed streamId,
        address   indexed sender,
        address   indexed token,
        address[] recipients,
        int96[]   flowRates,
        int96     totalFlowRate,
        uint256   totalAmount,
        uint256   depositAmount,
        uint256   feeAmount,
        address   vault,
        uint256   startTime,
        uint256   endTime,
        string    title
    );

    event StreamPaused(uint256 indexed streamId, uint256 pausedAt);
    event StreamResumed(uint256 indexed streamId, uint256 newEndTime);
    event StreamCancelled(uint256 indexed streamId, address indexed vault, uint256 refundAmount, uint256 finishTime);
    event StreamCompleted(uint256 indexed streamId, address indexed vault, uint256 finishTime);
    event StreamToppedUp(uint256 indexed streamId, uint256 newEndTime);
    event StreamRateLocked(uint256 indexed streamId, uint256 rateLockUntil);

    /// @dev Emitted when a single recipient's flow is paused (stream stays Active).
    event RecipientPaused(uint256 indexed streamId, address indexed recipient);

    /// @dev Emitted when a single paused recipient's flow is restarted.
    event RecipientResumed(uint256 indexed streamId, address indexed recipient, uint256 newEndTime);

    /**
     * @dev Emitted when a recipient is permanently removed from a stream.
     *      The returned buffer and freed capacity extends the stream for remaining recipients.
     *      If the last active recipient is removed the stream is immediately completed.
     */
    event RecipientRemoved(
        uint256 indexed streamId,
        address indexed recipient,
        int96   newTotalFlowRate,
        uint256 newEndTime
    );

    event PhoneMapped(address indexed user, bytes32 phoneHash);
    event PhoneUnmapped(address indexed user, bytes32 phoneHash);
    event PhoneEncryptedDataUpdated(address indexed user);

    event PlatformFeeUpdated(uint256 newFeeBps, address newRecipient);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ═══════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════

    constructor(address _vaultImpl, address _platformFeeRecipient) {
        require(_vaultImpl != address(0), "DripV4: zero vault impl");
        owner                = msg.sender;
        vaultImplementation  = _vaultImpl;
        platformFeeRecipient = _platformFeeRecipient;
        platformFeeBps       = 50; // 0.5% default
    }

    // ═══════════════════════════════════════════
    // Modifiers
    // ═══════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "DripV4: not owner");
        _;
    }

    // ═══════════════════════════════════════════
    // Stream lifecycle
    // ═══════════════════════════════════════════

    /**
     * @notice Create and immediately start a capped, multi-recipient stream.
     *
     *         Prerequisites:
     *           Approve DripV4 for at least: totalAmount + totalFlowRate * BUFFER_SECONDS
     *           (Use getRecommendedDeposit() to get the exact amount.)
     *
     * @param recipients   One or more recipient addresses (max 50).
     * @param token        Super Token address.
     * @param flowRates    flowRates[i] is the wei/second rate for recipients[i].
     * @param totalAmount  Gross wei to stream. Platform fee is deducted from this.
     * @param title        Label (max 120 chars).
     * @param description  Notes (max 1024 chars).
     */
    function createStream(
        address[] calldata recipients,
        address   token,
        int96[]   calldata flowRates,
        uint256   totalAmount,
        string    calldata title,
        string    calldata description
    ) external returns (uint256 streamId, address vault) {
        // ── Validation ────────────────────────────────────────────────────────
        require(recipients.length > 0,                        "DripV4: no recipients");
        require(recipients.length <= MAX_RECIPIENTS,          "DripV4: too many recipients");
        require(recipients.length == flowRates.length,        "DripV4: length mismatch");
        require(token != address(0),                          "DripV4: zero token");
        require(totalAmount > 0,                              "DripV4: zero total amount");
        require(bytes(title).length       <= MAX_TITLE_LEN,       "DripV4: title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN, "DripV4: description too long");

        int96 totalFlowRate;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0), "DripV4: zero recipient");
            require(recipients[i] != msg.sender, "DripV4: self recipient");
            require(flowRates[i]   > 0,          "DripV4: zero flow rate");
            totalFlowRate += flowRates[i];
        }

        // ── Duration bounds ───────────────────────────────────────────────────
        uint256 grossDuration = totalAmount / uint256(uint96(totalFlowRate));
        require(grossDuration <= MAX_DURATION, "DripV4: duration too long");

        // ── Fee + deposit calculation ─────────────────────────────────────────
        uint256 feeAmount = (platformFeeRecipient != address(0) && platformFeeBps > 0)
            ? (totalAmount * platformFeeBps / 10_000)
            : 0;
        uint256 netAmount    = totalAmount - feeAmount;
        uint256 totalBuffer  = uint256(uint96(totalFlowRate)) * BUFFER_SECONDS;
        uint256 vaultDeposit = netAmount + totalBuffer;
        uint256 duration     = netAmount / uint256(uint96(totalFlowRate));

        // ── Deploy vault ──────────────────────────────────────────────────────
        vault = Clones.clone(vaultImplementation);
        IStreamVault(vault).initialize(address(this), msg.sender);

        // ── Pull tokens ───────────────────────────────────────────────────────
        if (feeAmount > 0) {
            require(
                IERC20Min(token).transferFrom(msg.sender, platformFeeRecipient, feeAmount),
                "DripV4: fee transfer failed"
            );
        }
        require(
            IERC20Min(token).transferFrom(msg.sender, vault, vaultDeposit),
            "DripV4: vault transfer failed (check approval)"
        );

        // ── Start CFA flows ───────────────────────────────────────────────────
        IStreamVault(vault).startStreams(token, recipients, flowRates);

        // ── Persist ───────────────────────────────────────────────────────────
        _idCounter++;
        streamId = _idCounter;

        address[] memory recipientsCopy = new address[](recipients.length);
        int96[]   memory flowRatesCopy  = new int96[](flowRates.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            recipientsCopy[i] = recipients[i];
            flowRatesCopy[i]  = flowRates[i];
            _recipientStreams[recipients[i]].push(streamId);
        }

        _streams[streamId] = Stream({
            streamId:      streamId,
            sender:        msg.sender,
            recipients:    recipientsCopy,
            token:         token,
            flowRates:     flowRatesCopy,
            totalFlowRate: totalFlowRate,
            totalAmount:   netAmount,
            depositAmount: vaultDeposit,
            vault:         vault,
            startTime:     block.timestamp,
            endTime:       block.timestamp + duration,
            finishTime:    0,
            pausedAt:      0,
            rateLockUntil: 0,
            status:        StreamStatus.Active,
            title:         title,
            description:   description
        });

        _senderStreams[msg.sender].push(streamId);

        emit StreamCreated(
            streamId, msg.sender, token,
            recipientsCopy, flowRatesCopy, totalFlowRate,
            netAmount, vaultDeposit, feeAmount,
            vault,
            block.timestamp, block.timestamp + duration,
            title
        );
    }

    /**
     * @notice Pause an active stream.
     *         Stops all CFA flows; Superfluid returns each buffer to the vault.
     *         endTime is extended on resumeStream() to compensate.
     *         Blocked if the stream is rate-locked.
     *         Only the sender (or contract owner) may pause.
     */
    function pauseStream(uint256 streamId) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV4: not found");
        require(msg.sender == s.sender || msg.sender == owner, "DripV4: unauthorized");
        require(s.status == StreamStatus.Active,   "DripV4: not active");
        require(block.timestamp >= s.rateLockUntil, "DripV4: rate locked");

        IStreamVault(s.vault).stopStreams(s.token, s.recipients);
        s.pausedAt = block.timestamp;
        s.status   = StreamStatus.Paused;

        emit StreamPaused(streamId, block.timestamp);
    }

    /**
     * @notice Resume a paused stream.
     *         Restarts all CFA flows and extends endTime by the duration of the pause.
     *         Only the sender (or contract owner) may resume.
     */
    function resumeStream(uint256 streamId) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV4: not found");
        require(msg.sender == s.sender || msg.sender == owner, "DripV4: unauthorized");
        require(s.status == StreamStatus.Paused,   "DripV4: not paused");
        // No expiry check here — endTime is always extended by the pause duration below.
        // Superfluid will revert startStreams if the vault lacks sufficient balance.

        // Extend endTime by however long the stream was paused.
        uint256 pauseDuration = block.timestamp - s.pausedAt;
        s.endTime  += pauseDuration;
        s.pausedAt  = 0;
        s.status    = StreamStatus.Active;

        // Restart only recipients that are neither permanently removed nor individually paused.
        (address[] memory resumable, int96[] memory rates,) = _getResumableRecipients(streamId, s);
        if (resumable.length > 0) {
            IStreamVault(s.vault).startStreams(s.token, resumable, rates);
        }

        emit StreamResumed(streamId, s.endTime);
    }

    /**
     * @notice Cancel an active or paused stream.
     *         Stops all flows, refunds remaining vault balance to sender.
     *         Blocked if the stream is rate-locked.
     *         Only the sender (or contract owner) may cancel.
     */
    function cancelStream(uint256 streamId) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,   "DripV4: not found");
        require(msg.sender == s.sender || msg.sender == owner, "DripV4: unauthorized");
        require(
            s.status == StreamStatus.Active || s.status == StreamStatus.Paused,
            "DripV4: not cancellable"
        );
        require(block.timestamp >= s.rateLockUntil, "DripV4: rate locked");

        uint256 refundAmount = _closeStream(s);
        s.status     = StreamStatus.Cancelled;
        s.finishTime = block.timestamp;

        emit StreamCancelled(streamId, s.vault, refundAmount, s.finishTime);
    }

    /**
     * @notice Expire a stream whose endTime has passed.
     *         Callable by anyone — intended for the keeper service.
     *         Bypasses the rate lock (natural completion, not a cancellation).
     */
    function expireStream(uint256 streamId) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                  "DripV4: not found");
        require(s.status == StreamStatus.Active,  "DripV4: not active");
        require(block.timestamp >= s.endTime,     "DripV4: not yet expired");

        _closeStream(s);
        s.status     = StreamStatus.Completed;
        s.finishTime = block.timestamp;

        emit StreamCompleted(streamId, s.vault, s.finishTime);
    }

    /**
     * @notice Recalculate endTime based on current vault balance after a top-up.
     *         Send extra tokens directly to the vault address, then call this.
     *         Callable by anyone.
     */
    /**
     * @notice Recalculate endTime based on current vault balance and active flow rate.
     *         Call this after topping up a vault (send tokens directly to the vault address).
     *         Uses the active (non-paused, non-removed) recipient rate for accuracy.
     *         Callable by anyone.
     */
    function refreshEndTime(uint256 streamId) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                 "DripV4: not found");
        require(s.status == StreamStatus.Active, "DripV4: not active");

        _refreshEndTimeInternal(streamId, s);

        emit StreamToppedUp(streamId, s.endTime);
    }

    /**
     * @notice Lock the stream — prevents cancel and pause until `lockDuration` seconds pass.
     *         Gives recipients a guarantee of uninterrupted flow.
     *         Only the sender may lock; cannot shorten an existing lock.
     */
    function lockStreamRate(uint256 streamId, uint256 lockDuration) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,   "DripV4: not found");
        require(msg.sender == s.sender, "DripV4: not sender");
        require(
            s.status == StreamStatus.Active || s.status == StreamStatus.Paused,
            "DripV4: stream ended"
        );

        uint256 newLock = block.timestamp + lockDuration;
        require(newLock > s.rateLockUntil, "DripV4: cannot shorten lock");

        s.rateLockUntil = newLock;
        emit StreamRateLocked(streamId, newLock);
    }

    // ═══════════════════════════════════════════
    // Per-recipient controls
    // ═══════════════════════════════════════════

    /**
     * @notice Pause the CFA flow to a single recipient within an active stream.
     *         Other recipients continue receiving normally.
     *         The stream itself stays Active; endTime is recalculated from remaining balance.
     *         Rate lock does NOT apply — only whole-stream cancel/pause is locked.
     *         Only the sender (or contract owner) may pause a recipient.
     */
    function pauseRecipient(uint256 streamId, address recipient) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV4: not found");
        require(msg.sender == s.sender || msg.sender == owner, "DripV4: unauthorized");
        require(s.status == StreamStatus.Active,   "DripV4: stream not active");
        require(!_recipientRemoved[streamId][recipient], "DripV4: recipient removed");
        require(!_recipientPaused[streamId][recipient],  "DripV4: already paused");
        require(_findFlowRate(s, recipient) > 0,   "DripV4: recipient not in stream");

        address[] memory single = new address[](1);
        single[0] = recipient;
        IStreamVault(s.vault).stopStreams(s.token, single);

        _recipientPaused[streamId][recipient] = true;

        // Recalculate endTime — the stopped buffer is returned, extending remaining recipients.
        _refreshEndTimeInternal(streamId, s);

        emit RecipientPaused(streamId, recipient);
    }

    /**
     * @notice Resume the CFA flow to a single individually-paused recipient.
     *         The stream must be Active (not globally paused).
     *         Only the sender (or contract owner) may resume.
     */
    function resumeRecipient(uint256 streamId, address recipient) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV4: not found");
        require(msg.sender == s.sender || msg.sender == owner, "DripV4: unauthorized");
        require(s.status == StreamStatus.Active,   "DripV4: stream not active");
        require(_recipientPaused[streamId][recipient], "DripV4: not paused");
        require(!_recipientRemoved[streamId][recipient], "DripV4: recipient removed");

        int96 rate = _findFlowRate(s, recipient);
        require(rate > 0, "DripV4: recipient not in stream");

        address[] memory single = new address[](1);
        int96[]   memory rates  = new int96[](1);
        single[0] = recipient;
        rates[0]  = rate;
        IStreamVault(s.vault).startStreams(s.token, single, rates);

        _recipientPaused[streamId][recipient] = false;

        // Recalculate endTime — new buffer was deducted so adjust remaining duration.
        _refreshEndTimeInternal(streamId, s);

        emit RecipientResumed(streamId, recipient, s.endTime);
    }

    /**
     * @notice Permanently remove a recipient from a stream, stopping their flow immediately.
     *         Their returned buffer and freed rate extend the stream for remaining recipients.
     *         If this was the last active recipient, the stream is auto-completed and the vault
     *         balance is refunded to the sender.
     *         Rate lock does NOT block individual recipient removal.
     *         Only the sender (or contract owner) may remove.
     */
    function removeRecipient(uint256 streamId, address recipient) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,   "DripV4: not found");
        require(msg.sender == s.sender || msg.sender == owner, "DripV4: unauthorized");
        require(
            s.status == StreamStatus.Active || s.status == StreamStatus.Paused,
            "DripV4: stream ended"
        );
        require(!_recipientRemoved[streamId][recipient], "DripV4: already removed");

        int96 rate = _findFlowRate(s, recipient);
        require(rate > 0, "DripV4: recipient not in stream");

        // Stop the flow if the stream is active (Paused streams have no active flows).
        if (s.status == StreamStatus.Active && !_recipientPaused[streamId][recipient]) {
            address[] memory single = new address[](1);
            single[0] = recipient;
            IStreamVault(s.vault).stopStreams(s.token, single);
        }

        _recipientRemoved[streamId][recipient] = true;
        // Clear any individual pause flag.
        _recipientPaused[streamId][recipient]  = false;
        s.totalFlowRate -= rate;

        // Check if any active recipients remain.
        uint256 activeCount;
        for (uint256 i = 0; i < s.recipients.length; i++) {
            if (!_recipientRemoved[streamId][s.recipients[i]]) activeCount++;
        }

        if (activeCount == 0) {
            // No recipients left — close the vault and complete the stream.
            uint256 refund = IStreamVault(s.vault).getBalance(s.token);
            if (refund > 0) IStreamVault(s.vault).refund(s.token, s.sender);
            s.status     = StreamStatus.Completed;
            s.finishTime = block.timestamp;
            emit StreamCompleted(streamId, s.vault, s.finishTime);
        } else {
            // Recalculate endTime with the updated (lower) total flow rate.
            if (s.status == StreamStatus.Active) {
                _refreshEndTimeInternal(streamId, s);
            }
        }

        emit RecipientRemoved(streamId, recipient, s.totalFlowRate, s.endTime);
    }

    // ═══════════════════════════════════════════
    // Phone mapping
    // ═══════════════════════════════════════════

    /**
     * @notice Bind msg.sender's address to a hashed phone number.
     *         Replaces any previous phone binding for this address.
     *         Reverts if the new hash is already claimed by another address.
     */
    function registerPhone(bytes32 phoneHash) external {
        require(phoneHash != bytes32(0), "DripV4: empty hash");
        // Clear old binding for this address.
        bytes32 old = _addressToPhone[msg.sender];
        if (old != bytes32(0)) delete _phoneToAddress[old];
        // Guard: new hash must not already belong to someone else.
        require(_phoneToAddress[phoneHash] == address(0), "DripV4: phone already mapped");
        _phoneToAddress[phoneHash]  = msg.sender;
        _addressToPhone[msg.sender] = phoneHash;
        emit PhoneMapped(msg.sender, phoneHash);
    }

    /**
     * @notice Register phone hash AND store an encrypted phone payload in one call.
     * @param phoneHash           keccak256(normalized E.164 number).
     * @param encryptedPhoneData  Client-encrypted bytes (e.g. NaCl box).
     */
    function registerPhoneSecure(bytes32 phoneHash, bytes calldata encryptedPhoneData) external {
        require(phoneHash != bytes32(0),        "DripV4: empty hash");
        require(encryptedPhoneData.length > 0,  "DripV4: empty encrypted data");
        bytes32 old = _addressToPhone[msg.sender];
        if (old != bytes32(0)) delete _phoneToAddress[old];
        require(_phoneToAddress[phoneHash] == address(0), "DripV4: phone already mapped");
        _phoneToAddress[phoneHash]              = msg.sender;
        _addressToPhone[msg.sender]             = phoneHash;
        _addressToEncryptedPhone[msg.sender]    = encryptedPhoneData;
        emit PhoneMapped(msg.sender, phoneHash);
        emit PhoneEncryptedDataUpdated(msg.sender);
    }

    /**
     * @notice Update encrypted phone payload (e.g. after a key rotation).
     *         Address must already have a phone mapping.
     */
    function updateEncryptedPhoneData(bytes calldata encryptedPhoneData) external {
        require(_addressToPhone[msg.sender] != bytes32(0), "DripV4: no phone mapping");
        require(encryptedPhoneData.length > 0,             "DripV4: empty encrypted data");
        _addressToEncryptedPhone[msg.sender] = encryptedPhoneData;
        emit PhoneEncryptedDataUpdated(msg.sender);
    }

    /// @notice Remove msg.sender's phone binding and encrypted data.
    function unregisterPhone() external {
        bytes32 h = _addressToPhone[msg.sender];
        require(h != bytes32(0), "DripV4: no mapping");
        delete _phoneToAddress[h];
        delete _addressToPhone[msg.sender];
        delete _addressToEncryptedPhone[msg.sender];
        emit PhoneUnmapped(msg.sender, h);
    }

    // ═══════════════════════════════════════════
    // View functions
    // ═══════════════════════════════════════════

    function getStream(uint256 streamId) external view returns (Stream memory) {
        require(_streams[streamId].streamId != 0, "DripV4: not found");
        return _streams[streamId];
    }

    function getVaultBalance(uint256 streamId) external view returns (uint256) {
        Stream memory s = _streams[streamId];
        require(s.streamId != 0, "DripV4: not found");
        return IStreamVault(s.vault).getBalance(s.token);
    }

    /// @notice Live CFA flow rate from vault to a specific recipient (Superfluid source of truth).
    function getLiveFlowRate(uint256 streamId, address recipient)
        external view returns (int96 flowRate)
    {
        Stream memory s = _streams[streamId];
        require(s.streamId != 0, "DripV4: not found");
        bytes memory data = abi.encodeWithSelector(
            ICFAv1Forwarder.getFlowrate.selector,
            s.token, s.vault, recipient
        );
        (bool ok, bytes memory result) = CFA_FORWARDER.staticcall(data);
        if (ok && result.length >= 32) {
            flowRate = int96(int256(uint256(bytes32(result))));
        }
    }

    /**
     * @notice How much the user needs to approve before calling createStream.
     *         = grossTotalAmount + totalFlowRate * BUFFER_SECONDS
     *         (Platform fee is included inside grossTotalAmount.)
     */
    function getRecommendedDeposit(int96 totalFlowRate, uint256 grossTotalAmount)
        external pure returns (uint256)
    {
        return grossTotalAmount + uint256(uint96(totalFlowRate)) * BUFFER_SECONDS;
    }

    function getSenderStreams(address sender)
        external view returns (uint256[] memory)
    {
        return _senderStreams[sender];
    }

    function getRecipientStreams(address recipient)
        external view returns (uint256[] memory)
    {
        return _recipientStreams[recipient];
    }

    /// @notice Full Stream structs for all streams sent by `user` (legacy frontend compat).
    function getUserSentStreams(address user)
        external view returns (Stream[] memory streams)
    {
        uint256[] memory ids = _senderStreams[user];
        streams = new Stream[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) streams[i] = _streams[ids[i]];
    }

    /// @notice Full Stream structs for all streams received by `user` (legacy frontend compat).
    function getUserReceivedStreams(address user)
        external view returns (Stream[] memory streams)
    {
        uint256[] memory ids = _recipientStreams[user];
        streams = new Stream[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) streams[i] = _streams[ids[i]];
    }

    function resolveAddressByPhone(bytes32 phoneHash) external view returns (address) {
        return _phoneToAddress[phoneHash];
    }

    function resolvePhoneByAddress(address user) external view returns (bytes32) {
        return _addressToPhone[user];
    }

    function getEncryptedPhoneByAddress(address user) external view returns (bytes memory) {
        return _addressToEncryptedPhone[user];
    }

    function isPhoneRegistered(bytes32 phoneHash) external view returns (bool) {
        return _phoneToAddress[phoneHash] != address(0);
    }

    function isAddressPhoneRegistered(address user) external view returns (bool) {
        return _addressToPhone[user] != bytes32(0);
    }

    /// @notice True if the recipient's individual flow has been paused (stream still Active).
    function isRecipientPaused(uint256 streamId, address recipient) external view returns (bool) {
        return _recipientPaused[streamId][recipient];
    }

    /// @notice True if the recipient has been permanently removed from the stream.
    function isRecipientRemoved(uint256 streamId, address recipient) external view returns (bool) {
        return _recipientRemoved[streamId][recipient];
    }

    /**
     * @notice Returns the subset of recipients that are currently receiving (not removed, not
     *         individually paused, and stream itself is Active).
     */
    function getActiveRecipients(uint256 streamId)
        external view
        returns (address[] memory addrs, int96[] memory rates)
    {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0, "DripV4: not found");
        (addrs, rates,) = _getResumableRecipients(streamId, s);
    }

    function streamCount() external view returns (uint256) {
        return _idCounter;
    }

    // ═══════════════════════════════════════════
    // Admin
    // ═══════════════════════════════════════════

    /**
     * @notice Update platform fee.
     * @param newFeeBps       New fee in basis points (max 1000 = 10%).
     * @param newRecipient    Address that receives the fee. Pass address(0) to disable fee.
     */
    function setPlatformFee(uint256 newFeeBps, address newRecipient) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "DripV4: fee too high");
        platformFeeBps       = newFeeBps;
        platformFeeRecipient = newRecipient;
        emit PlatformFeeUpdated(newFeeBps, newRecipient);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "DripV4: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ═══════════════════════════════════════════
    // Internal helpers
    // ═══════════════════════════════════════════

    function _closeStream(Stream storage s) internal returns (uint256 refundAmount) {
        // Only stop flows that are currently active.  StreamVault.stopStreams uses try/catch so
        // already-stopped flows (removed or individually-paused recipients) are handled safely.
        if (s.status == StreamStatus.Active) {
            IStreamVault(s.vault).stopStreams(s.token, s.recipients);
        }
        refundAmount = IStreamVault(s.vault).getBalance(s.token);
        if (refundAmount > 0) {
            IStreamVault(s.vault).refund(s.token, s.sender);
        }
    }

    /**
     * @dev Returns the subset of recipients that should be restarted on resumeStream() or
     *      after a per-recipient operation: excludes removed AND individually-paused recipients.
     *      Uses inline assembly to resize the dynamic arrays to `count` to avoid returning
     *      zero-address padding.
     */
    function _getResumableRecipients(uint256 streamId, Stream storage s)
        private view
        returns (address[] memory addrs, int96[] memory rates, uint256 count)
    {
        uint256 n = s.recipients.length;
        // First pass: count eligible recipients to allocate exact-size arrays.
        count = 0;
        for (uint256 i = 0; i < n; i++) {
            address r = s.recipients[i];
            if (!_recipientRemoved[streamId][r] && !_recipientPaused[streamId][r]) count++;
        }
        // Second pass: fill.
        addrs = new address[](count);
        rates = new int96[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < n; i++) {
            address r = s.recipients[i];
            if (!_recipientRemoved[streamId][r] && !_recipientPaused[streamId][r]) {
                addrs[j] = r;
                rates[j] = s.flowRates[i];
                j++;
            }
        }
    }

    /// @dev Looks up the stored flow rate for `recipient` in stream `s`. Returns 0 if not found.
    function _findFlowRate(Stream storage s, address recipient) private view returns (int96) {
        for (uint256 i = 0; i < s.recipients.length; i++) {
            if (s.recipients[i] == recipient) return s.flowRates[i];
        }
        return 0;
    }

    /**
     * @dev Recompute endTime based on the current vault balance and active flow rate.
     *
     *      Superfluid's balanceOf reflects the vault balance MINUS the buffers for all
     *      currently-flowing streams.  When a recipient is individually paused or removed,
     *      their Superfluid buffer is RETURNED to the vault (vaultBal goes up).  We must
     *      subtract those returned buffers so the endTime isn't artificially inflated.
     *
     *      Formula:
     *        inactiveBuffer = Σ flowRates[i] * BUFFER_SECONDS  (paused + removed recipients)
     *        streamable     = vaultBal - inactiveBuffer
     *        endTime        = now + streamable / activeRate
     */
    function _refreshEndTimeInternal(uint256 streamId, Stream storage s) private {
        int96 activeRate;
        int96 inactiveRate; // paused or removed — their buffers were returned to vault
        for (uint256 i = 0; i < s.recipients.length; i++) {
            address r = s.recipients[i];
            if (!_recipientRemoved[streamId][r] && !_recipientPaused[streamId][r]) {
                activeRate   += s.flowRates[i];
            } else {
                inactiveRate += s.flowRates[i];
            }
        }
        if (activeRate <= 0) return;
        uint256 vaultBal       = IStreamVault(s.vault).getBalance(s.token);
        uint256 inactiveBuffer = uint256(uint96(inactiveRate)) * BUFFER_SECONDS;
        uint256 streamable     = vaultBal > inactiveBuffer ? vaultBal - inactiveBuffer : 0;
        s.endTime = block.timestamp + streamable / uint256(uint96(activeRate));
    }
}
