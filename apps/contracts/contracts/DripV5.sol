// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IStreamVault.sol";

/**
 * @title DripV5
 * @notice DripV4 + in-contract swap funding.
 *
 * Everything in DripV4 is preserved verbatim. DripV5 adds a single new entry point —
 * `createStreamWithSwap` — that lets a user fund a G$ stream by paying in a non-Super
 * token (USDC). The contract pulls the funding token, swaps it to G$ via Uniswap V3
 * (exactOutput, so the stream is funded to the exact penny), refunds any unused input,
 * then runs the identical DripV4 stream-creation flow.
 *
 * Design notes:
 *  - The swap happens in the FACTORY. Each StreamVault stays a pure G$ holder, so the
 *    per-stream isolation guarantee is untouched.
 *  - exactOutput => the resulting stream is exactly what the user designed (same
 *    recipients / flowRates / totalAmount as createStream). USDC is only a funding source.
 *  - Slippage protection is the caller-supplied `maxAmountIn` (quote off-chain, add ~1%).
 */

interface ICFAv1Forwarder {
    function getFlowrate(address token, address sender, address receiver)
        external view returns (int96 flowRate);
}

interface IERC20Min {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @dev Uniswap V3 SwapRouter02 (no per-call deadline field), verified at 0x5615… on Celo.
interface ISwapRouter {
    struct ExactOutputParams {
        bytes   path;            // reverse-encoded: tokenOut → … → tokenIn
        address recipient;
        uint256 amountOut;
        uint256 amountInMaximum;
    }
    function exactOutput(ExactOutputParams calldata params) external payable returns (uint256 amountIn);
}

contract DripV5 is ReentrancyGuard {

    // ═══════════════════════════════════════════
    // Constants
    // ═══════════════════════════════════════════

    address public constant CFA_FORWARDER = 0xcfA132E353cB4E398080B9700609bb008eceB125;

    /// @dev Uniswap V3 SwapRouter on Celo (verified Jun 2026).
    address public constant SWAP_ROUTER = 0x5615CDAb10dc425a742d643d949a7F474C01abc4;

    /// @dev GoodDollar Super Token on Celo — the only token streams are denominated in
    ///      when funded via swap.
    address public constant GOOD_DOLLAR = 0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A;

    uint256 public constant DEFAULT_BUFFER_SECONDS = 14_400; // 4 hours — Celo liquidation period
    uint256 public constant MIN_BUFFER_SECONDS     = 3_600;  // floor for governable buffer
    uint256 public constant MAX_BUFFER_SECONDS     = 30 days; // ceiling for governable buffer
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
        StreamStatus status;
        string       title;
        string       description;
    }

    // ═══════════════════════════════════════════
    // State
    // ═══════════════════════════════════════════

    address public owner;
    address public pendingOwner;            // Ownable2Step: must call acceptOwnership()
    address public vaultImplementation;

    /// @dev Governable Superfluid liquidation/buffer period. Bounded to
    ///      [MIN_BUFFER_SECONDS, MAX_BUFFER_SECONDS] so it can track protocol changes
    ///      without a redeploy, while never being set to an unsafe value.
    uint256 public bufferSeconds;

    /// @dev Emergency stop. Blocks NEW stream creation only; existing streams are unaffected.
    bool public paused;

    uint256 public platformFeeBps;          // basis points, e.g. 50 = 0.5%
    address public platformFeeRecipient;    // receives the fee; no fee if address(0)

    uint256 private _idCounter;

    mapping(uint256 => Stream)        private _streams;
    mapping(address => uint256[])     private _senderStreams;
    mapping(address => uint256[])     private _recipientStreams;

    // Per-recipient state within a stream (independent of whole-stream status).
    mapping(uint256 => mapping(address => bool)) private _recipientPaused;
    mapping(uint256 => mapping(address => bool)) private _recipientRemoved;

    // Phone mapping
    mapping(bytes32 => address) private _phoneToAddress;
    mapping(address => bytes32) private _addressToPhone;
    mapping(address => bytes)   private _addressToEncryptedPhone;

    // ── Swap funding (V5) ───────────────────────────────────────────────────
    /// @notice Funding token accepted by createStreamWithSwap (e.g. USDC). 0 = disabled.
    address public usdcToken;
    /// @notice Reverse-encoded Uniswap V3 path: G$ → … → usdcToken (for exactOutput).
    bytes   public usdcSwapPath;

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

    /// @dev Emitted on createStreamWithSwap with how much funding token was consumed.
    event StreamFundedBySwap(uint256 indexed streamId, address indexed tokenIn, uint256 amountInSpent, uint256 gdAcquired);
    event SwapRouteUpdated(address indexed tokenIn);

    event RecipientPaused(uint256 indexed streamId, address indexed recipient);
    event RecipientResumed(uint256 indexed streamId, address indexed recipient, uint256 newEndTime);
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
    event OwnershipTransferStarted(address indexed previous, address indexed next);
    event OwnershipTransferred(address indexed previous, address indexed next);
    event BufferSecondsUpdated(uint256 newBufferSeconds);
    event PausedSet(bool paused);

    // ═══════════════════════════════════════════
    // Constructor
    // ═══════════════════════════════════════════

    constructor(address _vaultImpl, address _platformFeeRecipient) {
        require(_vaultImpl != address(0), "DripV5: zero vault impl");
        owner                = msg.sender;
        vaultImplementation  = _vaultImpl;
        platformFeeRecipient = _platformFeeRecipient;
        platformFeeBps       = 50; // 0.5% default
        bufferSeconds        = DEFAULT_BUFFER_SECONDS;
    }

    // ═══════════════════════════════════════════
    // Modifiers
    // ═══════════════════════════════════════════

    modifier onlyOwner() {
        require(msg.sender == owner, "DripV5: not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "DripV5: paused");
        _;
    }

    // ═══════════════════════════════════════════
    // Stream lifecycle
    // ═══════════════════════════════════════════

    /**
     * @notice Create and immediately start a capped, multi-recipient stream.
     *         Prerequisites: approve DripV5 for totalAmount + totalFlowRate * bufferSeconds.
     */
    function createStream(
        address[] calldata recipients,
        address   token,
        int96[]   calldata flowRates,
        uint256   totalAmount,
        string    calldata title,
        string    calldata description
    ) external nonReentrant whenNotPaused returns (uint256 streamId, address vault) {
        return _createStreamCore(msg.sender, recipients, token, flowRates, totalAmount, title, description, false);
    }

    /**
     * @notice Create a G$ stream funded by paying `usdcToken` (e.g. USDC).
     *         The stream params are identical to createStream — recipients, flowRates and
     *         totalAmount are all denominated in G$. The contract swaps the funding token
     *         to G$ (exactOutput) for the exact amount the stream needs and refunds any
     *         unused funding token.
     *
     *         Prerequisites: approve DripV5 to spend at least `maxAmountIn` of usdcToken.
     *
     * @param maxAmountIn   Max funding-token units to spend (slippage cap; quote off-chain).
     * @param recipients    Recipient addresses (max 50).
     * @param flowRates     wei/s G$ rate for each recipient.
     * @param totalAmount   Gross G$ to stream (platform fee deducted from this).
     * @param title         Label (max 120 chars).
     * @param description   Notes (max 1024 chars).
     */
    function createStreamWithSwap(
        uint256   maxAmountIn,
        address[] calldata recipients,
        int96[]   calldata flowRates,
        uint256   totalAmount,
        string    calldata title,
        string    calldata description
    ) external nonReentrant whenNotPaused returns (uint256 streamId, address vault) {
        require(usdcToken != address(0) && usdcSwapPath.length > 0, "DripV5: swap route not set");
        require(maxAmountIn > 0,                       "DripV5: zero maxAmountIn");
        require(recipients.length == flowRates.length, "DripV5: length mismatch");
        require(totalAmount > 0,                        "DripV5: zero total amount");

        // Size the swap: total G$ the stream consumes = totalAmount + buffer.
        // (fee is carved out of totalAmount, so fee + vaultDeposit == totalAmount + buffer.)
        int96 totalFlowRate;
        for (uint256 i = 0; i < flowRates.length; i++) {
            require(flowRates[i] > 0, "DripV5: zero flow rate");
            totalFlowRate += flowRates[i];
        }
        uint256 neededGd = totalAmount + uint256(uint96(totalFlowRate)) * bufferSeconds;

        // Pull funding token and swap to exactly `neededGd` G$ held by this contract.
        require(
            IERC20Min(usdcToken).transferFrom(msg.sender, address(this), maxAmountIn),
            "DripV5: funding transfer failed (check approval)"
        );
        IERC20Min(usdcToken).approve(SWAP_ROUTER, maxAmountIn);
        uint256 spent = ISwapRouter(SWAP_ROUTER).exactOutput(
            ISwapRouter.ExactOutputParams({
                path:            usdcSwapPath,
                recipient:       address(this),
                amountOut:       neededGd,
                amountInMaximum: maxAmountIn
            })
        );
        // Clear residual allowance and refund unused funding token.
        IERC20Min(usdcToken).approve(SWAP_ROUTER, 0);
        if (spent < maxAmountIn) {
            require(
                IERC20Min(usdcToken).transfer(msg.sender, maxAmountIn - spent),
                "DripV5: refund failed"
            );
        }

        // Contract now holds `neededGd` G$ — run the standard creation flow funded internally.
        (streamId, vault) = _createStreamCore(
            msg.sender, recipients, GOOD_DOLLAR, flowRates,
            totalAmount, title, description, true
        );

        emit StreamFundedBySwap(streamId, usdcToken, spent, neededGd);
    }

    /**
     * @dev Shared stream-creation logic for both createStream and createStreamWithSwap.
     * @param fundsInContract  true  => fee + deposit transferred from this contract's balance
     *                         false => pulled from `streamSender` via transferFrom
     */
    function _createStreamCore(
        address           streamSender,
        address[] memory  recipients,
        address           token,
        int96[]   calldata flowRates,
        uint256           totalAmount,
        string    calldata title,
        string    calldata description,
        bool              fundsInContract
    ) private returns (uint256 streamId, address vault) {
        // ── Validation ────────────────────────────────────────────────────────
        require(recipients.length > 0,                        "DripV5: no recipients");
        require(recipients.length <= MAX_RECIPIENTS,          "DripV5: too many recipients");
        require(recipients.length == flowRates.length,        "DripV5: length mismatch");
        require(token != address(0),                          "DripV5: zero token");
        require(totalAmount > 0,                              "DripV5: zero total amount");
        require(bytes(title).length       <= MAX_TITLE_LEN,       "DripV5: title too long");
        require(bytes(description).length <= MAX_DESCRIPTION_LEN, "DripV5: description too long");

        int96 totalFlowRate;
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != address(0),    "DripV5: zero recipient");
            require(recipients[i] != streamSender,  "DripV5: self recipient");
            require(flowRates[i]   > 0,             "DripV5: zero flow rate");
            // Reject duplicate recipients — they would corrupt per-recipient accounting
            // (a single CFA flow per receiver) and inflate totalFlowRate/deposit.
            for (uint256 j = 0; j < i; j++) {
                require(recipients[i] != recipients[j], "DripV5: duplicate recipient");
            }
            totalFlowRate += flowRates[i];
        }

        // ── Duration bounds ───────────────────────────────────────────────────
        uint256 grossDuration = totalAmount / uint256(uint96(totalFlowRate));
        require(grossDuration <= MAX_DURATION, "DripV5: duration too long");

        // ── Fee + deposit calculation ─────────────────────────────────────────
        uint256 feeAmount = (platformFeeRecipient != address(0) && platformFeeBps > 0)
            ? (totalAmount * platformFeeBps / 10_000)
            : 0;
        uint256 netAmount    = totalAmount - feeAmount;
        uint256 totalBuffer  = uint256(uint96(totalFlowRate)) * bufferSeconds;
        uint256 vaultDeposit = netAmount + totalBuffer;
        uint256 duration     = netAmount / uint256(uint96(totalFlowRate));
        // Reject degenerate streams that would expire in the same block they start.
        require(duration > 0, "DripV5: duration too short");

        // ── Deploy vault ──────────────────────────────────────────────────────
        vault = Clones.clone(vaultImplementation);
        IStreamVault(vault).initialize(address(this), streamSender);

        // ── Fund: fee → recipient, deposit → vault ──────────────────────────────
        if (fundsInContract) {
            if (feeAmount > 0) {
                require(IERC20Min(token).transfer(platformFeeRecipient, feeAmount), "DripV5: fee transfer failed");
            }
            require(IERC20Min(token).transfer(vault, vaultDeposit), "DripV5: vault transfer failed");
        } else {
            if (feeAmount > 0) {
                require(
                    IERC20Min(token).transferFrom(streamSender, platformFeeRecipient, feeAmount),
                    "DripV5: fee transfer failed"
                );
            }
            require(
                IERC20Min(token).transferFrom(streamSender, vault, vaultDeposit),
                "DripV5: vault transfer failed (check approval)"
            );
        }

        // ── Start CFA flows ───────────────────────────────────────────────────
        IStreamVault(vault).startStreams(token, recipients, flowRates);

        // ── Persist ───────────────────────────────────────────────────────────
        _idCounter++;
        streamId = _idCounter;

        int96[] memory flowRatesCopy = new int96[](flowRates.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            flowRatesCopy[i] = flowRates[i];
            _recipientStreams[recipients[i]].push(streamId);
        }

        _streams[streamId] = Stream({
            streamId:      streamId,
            sender:        streamSender,
            recipients:    recipients,
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
            status:        StreamStatus.Active,
            title:         title,
            description:   description
        });

        _senderStreams[streamSender].push(streamId);

        emit StreamCreated(
            streamId, streamSender, token,
            recipients, flowRatesCopy, totalFlowRate,
            netAmount, vaultDeposit, feeAmount,
            vault,
            block.timestamp, block.timestamp + duration,
            title
        );
    }

    /**
     * @notice Pause an active stream. Stops all CFA flows; Superfluid returns buffers.
     */
    function pauseStream(uint256 streamId) external nonReentrant {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV5: not found");
        require(msg.sender == s.sender,            "DripV5: not sender");
        require(s.status == StreamStatus.Active,   "DripV5: not active");

        // Effects before interaction (CEI).
        s.pausedAt = block.timestamp;
        s.status   = StreamStatus.Paused;
        IStreamVault(s.vault).stopStreams(s.token, s.recipients);

        emit StreamPaused(streamId, block.timestamp);
    }

    /**
     * @notice Resume a paused stream. Restarts flows and extends endTime by pause duration.
     */
    function resumeStream(uint256 streamId) external nonReentrant {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV5: not found");
        require(msg.sender == s.sender,            "DripV5: not sender");
        require(s.status == StreamStatus.Paused,   "DripV5: not paused");

        uint256 pauseDuration = block.timestamp - s.pausedAt;
        s.endTime  += pauseDuration;
        s.pausedAt  = 0;
        s.status    = StreamStatus.Active;

        (address[] memory resumable, int96[] memory rates,) = _getResumableRecipients(streamId, s);
        if (resumable.length > 0) {
            IStreamVault(s.vault).startStreams(s.token, resumable, rates);
        }

        emit StreamResumed(streamId, s.endTime);
    }

    /**
     * @notice Cancel an active or paused stream. Refunds remaining vault balance to sender.
     */
    function cancelStream(uint256 streamId) external nonReentrant {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,   "DripV5: not found");
        require(msg.sender == s.sender, "DripV5: not sender");
        require(
            s.status == StreamStatus.Active || s.status == StreamStatus.Paused,
            "DripV5: not cancellable"
        );

        // Effects before interactions (CEI): mark closed, then stop flows / refund.
        bool wasActive = s.status == StreamStatus.Active;
        s.status     = StreamStatus.Cancelled;
        s.finishTime = block.timestamp;

        uint256 refundAmount = _closeStream(s, wasActive);

        emit StreamCancelled(streamId, s.vault, refundAmount, s.finishTime);
    }

    /**
     * @notice Expire a stream whose endTime has passed. Callable by anyone (keeper).
     */
    function expireStream(uint256 streamId) external nonReentrant {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                  "DripV5: not found");
        require(s.status == StreamStatus.Active,  "DripV5: not active");
        require(block.timestamp >= s.endTime,     "DripV5: not yet expired");

        // Effects before interactions (CEI).
        s.status     = StreamStatus.Completed;
        s.finishTime = block.timestamp;

        _closeStream(s, true);

        emit StreamCompleted(streamId, s.vault, s.finishTime);
    }

    /**
     * @notice Recalculate endTime based on current vault balance and active flow rate.
     *         Call after topping up a vault (send tokens directly to the vault address).
     */
    function refreshEndTime(uint256 streamId) external {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                 "DripV5: not found");
        require(s.status == StreamStatus.Active, "DripV5: not active");

        _refreshEndTimeInternal(streamId, s);

        emit StreamToppedUp(streamId, s.endTime);
    }

    /**
     * @notice Add funds to an active stream and extend its endTime atomically.
     *         Pulls `amount` of the stream token from the caller straight into
     *         the vault, then recalculates endTime from the new balance — all in
     *         one transaction, so endTime can never drift from the vault balance
     *         (unlike a bare transfer-to-vault followed by a separate refresh).
     *
     *         Caller must approve DripV5 to spend `amount` of the stream token.
     * @param streamId The stream to top up.
     * @param amount   Amount of the stream token to add (token units).
     */
    function topUp(uint256 streamId, uint256 amount) external nonReentrant whenNotPaused {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                 "DripV5: not found");
        require(s.status == StreamStatus.Active, "DripV5: not active");
        require(amount > 0,                      "DripV5: zero amount");

        require(
            IERC20Min(s.token).transferFrom(msg.sender, s.vault, amount),
            "DripV5: top-up transfer failed (check approval)"
        );

        _refreshEndTimeInternal(streamId, s);

        emit StreamToppedUp(streamId, s.endTime);
    }

    // ═══════════════════════════════════════════
    // Per-recipient controls
    // ═══════════════════════════════════════════

    function pauseRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV5: not found");
        require(msg.sender == s.sender,            "DripV5: not sender");
        require(s.status == StreamStatus.Active,   "DripV5: stream not active");
        require(!_recipientRemoved[streamId][recipient], "DripV5: recipient removed");
        require(!_recipientPaused[streamId][recipient],  "DripV5: already paused");
        require(_findFlowRate(s, recipient) > 0,   "DripV5: recipient not in stream");

        // Effects before interaction (CEI).
        _recipientPaused[streamId][recipient] = true;

        address[] memory single = new address[](1);
        single[0] = recipient;
        IStreamVault(s.vault).stopStreams(s.token, single);

        _refreshEndTimeInternal(streamId, s);

        emit RecipientPaused(streamId, recipient);
    }

    function resumeRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,                   "DripV5: not found");
        require(msg.sender == s.sender,            "DripV5: not sender");
        require(s.status == StreamStatus.Active,   "DripV5: stream not active");
        require(_recipientPaused[streamId][recipient], "DripV5: not paused");
        require(!_recipientRemoved[streamId][recipient], "DripV5: recipient removed");

        int96 rate = _findFlowRate(s, recipient);
        require(rate > 0, "DripV5: recipient not in stream");

        address[] memory single = new address[](1);
        int96[]   memory rates  = new int96[](1);
        single[0] = recipient;
        rates[0]  = rate;
        IStreamVault(s.vault).startStreams(s.token, single, rates);

        _recipientPaused[streamId][recipient] = false;
        _refreshEndTimeInternal(streamId, s);

        emit RecipientResumed(streamId, recipient, s.endTime);
    }

    function removeRecipient(uint256 streamId, address recipient) external nonReentrant {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0,   "DripV5: not found");
        require(msg.sender == s.sender, "DripV5: not sender");
        require(
            s.status == StreamStatus.Active || s.status == StreamStatus.Paused,
            "DripV5: stream ended"
        );
        require(!_recipientRemoved[streamId][recipient], "DripV5: already removed");

        int96 rate = _findFlowRate(s, recipient);
        require(rate > 0, "DripV5: recipient not in stream");

        // Effects before interactions (CEI). Capture paused state first so we don't
        // try to stop a flow that was already stopped by a prior pause.
        bool wasPaused = _recipientPaused[streamId][recipient];
        _recipientRemoved[streamId][recipient] = true;
        _recipientPaused[streamId][recipient]  = false;
        s.totalFlowRate -= rate;

        if (s.status == StreamStatus.Active && !wasPaused) {
            address[] memory single = new address[](1);
            single[0] = recipient;
            IStreamVault(s.vault).stopStreams(s.token, single);
        }

        uint256 activeCount;
        for (uint256 i = 0; i < s.recipients.length; i++) {
            if (!_recipientRemoved[streamId][s.recipients[i]]) activeCount++;
        }

        if (activeCount == 0) {
            s.status     = StreamStatus.Completed;
            s.finishTime = block.timestamp;
            uint256 refund = IStreamVault(s.vault).getBalance(s.token);
            if (refund > 0) IStreamVault(s.vault).refund(s.token, s.sender);
            emit StreamCompleted(streamId, s.vault, s.finishTime);
        } else {
            if (s.status == StreamStatus.Active) {
                _refreshEndTimeInternal(streamId, s);
            }
        }

        emit RecipientRemoved(streamId, recipient, s.totalFlowRate, s.endTime);
    }

    // ═══════════════════════════════════════════
    // Phone mapping
    // ═══════════════════════════════════════════

    function registerPhone(bytes32 phoneHash) external {
        require(phoneHash != bytes32(0), "DripV5: empty hash");
        bytes32 old = _addressToPhone[msg.sender];
        if (old != bytes32(0)) delete _phoneToAddress[old];
        require(_phoneToAddress[phoneHash] == address(0), "DripV5: phone already mapped");
        _phoneToAddress[phoneHash]  = msg.sender;
        _addressToPhone[msg.sender] = phoneHash;
        emit PhoneMapped(msg.sender, phoneHash);
    }

    function registerPhoneSecure(bytes32 phoneHash, bytes calldata encryptedPhoneData) external {
        require(phoneHash != bytes32(0),        "DripV5: empty hash");
        require(encryptedPhoneData.length > 0,  "DripV5: empty encrypted data");
        bytes32 old = _addressToPhone[msg.sender];
        if (old != bytes32(0)) delete _phoneToAddress[old];
        require(_phoneToAddress[phoneHash] == address(0), "DripV5: phone already mapped");
        _phoneToAddress[phoneHash]              = msg.sender;
        _addressToPhone[msg.sender]             = phoneHash;
        _addressToEncryptedPhone[msg.sender]    = encryptedPhoneData;
        emit PhoneMapped(msg.sender, phoneHash);
        emit PhoneEncryptedDataUpdated(msg.sender);
    }

    function updateEncryptedPhoneData(bytes calldata encryptedPhoneData) external {
        require(_addressToPhone[msg.sender] != bytes32(0), "DripV5: no phone mapping");
        require(encryptedPhoneData.length > 0,             "DripV5: empty encrypted data");
        _addressToEncryptedPhone[msg.sender] = encryptedPhoneData;
        emit PhoneEncryptedDataUpdated(msg.sender);
    }

    function unregisterPhone() external {
        bytes32 h = _addressToPhone[msg.sender];
        require(h != bytes32(0), "DripV5: no mapping");
        delete _phoneToAddress[h];
        delete _addressToPhone[msg.sender];
        delete _addressToEncryptedPhone[msg.sender];
        emit PhoneUnmapped(msg.sender, h);
    }

    // ═══════════════════════════════════════════
    // View functions
    // ═══════════════════════════════════════════

    function getStream(uint256 streamId) external view returns (Stream memory) {
        require(_streams[streamId].streamId != 0, "DripV5: not found");
        return _streams[streamId];
    }

    function getVaultBalance(uint256 streamId) external view returns (uint256) {
        Stream memory s = _streams[streamId];
        require(s.streamId != 0, "DripV5: not found");
        return IStreamVault(s.vault).getBalance(s.token);
    }

    function getLiveFlowRate(uint256 streamId, address recipient)
        external view returns (int96 flowRate)
    {
        Stream memory s = _streams[streamId];
        require(s.streamId != 0, "DripV5: not found");
        bytes memory data = abi.encodeWithSelector(
            ICFAv1Forwarder.getFlowrate.selector,
            s.token, s.vault, recipient
        );
        (bool ok, bytes memory result) = CFA_FORWARDER.staticcall(data);
        if (ok && result.length >= 32) {
            flowRate = int96(int256(uint256(bytes32(result))));
        }
    }

    function getRecommendedDeposit(int96 totalFlowRate, uint256 grossTotalAmount)
        external view returns (uint256)
    {
        return grossTotalAmount + uint256(uint96(totalFlowRate)) * bufferSeconds;
    }

    function getSenderStreams(address sender) external view returns (uint256[] memory) {
        return _senderStreams[sender];
    }

    function getRecipientStreams(address recipient) external view returns (uint256[] memory) {
        return _recipientStreams[recipient];
    }

    function getUserSentStreams(address user) external view returns (Stream[] memory streams) {
        uint256[] memory ids = _senderStreams[user];
        streams = new Stream[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) streams[i] = _streams[ids[i]];
    }

    function getUserReceivedStreams(address user) external view returns (Stream[] memory streams) {
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

    function isRecipientPaused(uint256 streamId, address recipient) external view returns (bool) {
        return _recipientPaused[streamId][recipient];
    }

    function isRecipientRemoved(uint256 streamId, address recipient) external view returns (bool) {
        return _recipientRemoved[streamId][recipient];
    }

    function getActiveRecipients(uint256 streamId)
        external view
        returns (address[] memory addrs, int96[] memory rates)
    {
        Stream storage s = _streams[streamId];
        require(s.streamId != 0, "DripV5: not found");
        (addrs, rates,) = _getResumableRecipients(streamId, s);
    }

    function streamCount() external view returns (uint256) {
        return _idCounter;
    }

    // ═══════════════════════════════════════════
    // Admin
    // ═══════════════════════════════════════════

    function setPlatformFee(uint256 newFeeBps, address newRecipient) external onlyOwner {
        require(newFeeBps <= MAX_FEE_BPS, "DripV5: fee too high");
        platformFeeBps       = newFeeBps;
        platformFeeRecipient = newRecipient;
        emit PlatformFeeUpdated(newFeeBps, newRecipient);
    }

    /**
     * @notice Configure the funding token + Uniswap V3 swap path used by createStreamWithSwap.
     * @param token  Funding token (e.g. USDC). Pass address(0) to disable swap funding.
     * @param path   Reverse-encoded Uniswap V3 path G$ → … → token (for exactOutput).
     *               e.g. abi.encodePacked(G$, uint24(10000), cUSD, uint24(100), USDC)
     */
    function setUsdcRoute(address token, bytes calldata path) external onlyOwner {
        if (token != address(0)) {
            require(path.length >= 43, "DripV5: invalid path"); // 20 + 3 + 20 minimum
        }
        usdcToken    = token;
        usdcSwapPath = path;
        emit SwapRouteUpdated(token);
    }

    /// @notice Update the governable buffer/liquidation period. Bounded for safety.
    function setBufferSeconds(uint256 newBufferSeconds) external onlyOwner {
        require(
            newBufferSeconds >= MIN_BUFFER_SECONDS && newBufferSeconds <= MAX_BUFFER_SECONDS,
            "DripV5: buffer out of range"
        );
        bufferSeconds = newBufferSeconds;
        emit BufferSecondsUpdated(newBufferSeconds);
    }

    /// @notice Emergency stop for NEW stream creation. Existing streams are unaffected and
    ///         users can always pause/cancel/expire their own streams.
    function setPaused(bool newPaused) external onlyOwner {
        paused = newPaused;
        emit PausedSet(newPaused);
    }

    /// @notice Begin a two-step ownership handover (DRIP-12). The new owner must call
    ///         acceptOwnership() before it takes effect, preventing transfers to a wrong address.
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "DripV5: zero address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Complete a two-step ownership handover.
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "DripV5: not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    // ═══════════════════════════════════════════
    // Internal helpers
    // ═══════════════════════════════════════════

    /// @param wasActive whether the stream had live CFA flows before the caller flipped status.
    function _closeStream(Stream storage s, bool wasActive) internal returns (uint256 refundAmount) {
        if (wasActive) {
            IStreamVault(s.vault).stopStreams(s.token, s.recipients);
        }
        refundAmount = IStreamVault(s.vault).getBalance(s.token);
        if (refundAmount > 0) {
            IStreamVault(s.vault).refund(s.token, s.sender);
        }
    }

    function _getResumableRecipients(uint256 streamId, Stream storage s)
        private view
        returns (address[] memory addrs, int96[] memory rates, uint256 count)
    {
        uint256 n = s.recipients.length;
        count = 0;
        for (uint256 i = 0; i < n; i++) {
            address r = s.recipients[i];
            if (!_recipientRemoved[streamId][r] && !_recipientPaused[streamId][r]) count++;
        }
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

    function _findFlowRate(Stream storage s, address recipient) private view returns (int96) {
        for (uint256 i = 0; i < s.recipients.length; i++) {
            if (s.recipients[i] == recipient) return s.flowRates[i];
        }
        return 0;
    }

    function _refreshEndTimeInternal(uint256 streamId, Stream storage s) private {
        int96 activeRate;
        int96 pausedRate; // only PAUSED buffers must stay reserved (for a future resume)
        for (uint256 i = 0; i < s.recipients.length; i++) {
            address r = s.recipients[i];
            // Removed recipients freed their buffer back to the vault for good — it is now
            // fully streamable to the remaining recipients, so it is NOT reserved here.
            if (_recipientRemoved[streamId][r]) continue;
            if (_recipientPaused[streamId][r]) {
                pausedRate += s.flowRates[i];
            } else {
                activeRate += s.flowRates[i];
            }
        }
        if (activeRate <= 0) return;
        uint256 vaultBal       = IStreamVault(s.vault).getBalance(s.token);
        uint256 reservedBuffer = uint256(uint96(pausedRate)) * bufferSeconds;
        uint256 streamable     = vaultBal > reservedBuffer ? vaultBal - reservedBuffer : 0;
        s.endTime = block.timestamp + streamable / uint256(uint96(activeRate));
    }
}
