/**
 * Superfluid GDA (General Distribution Agreement) ABI fragments
 * For DripCoreSuperfluid contract at 0x1fa7bFc6c0EDf1b17Ac410389f87cA1e44a52cab
 */

export const SUPERFLUID_GDA_ABI = [
  {
    inputs: [
      { type: "address[]", name: "recipients" },
      { type: "address", name: "token" },
      { type: "uint256[]", name: "amountsPerPeriod" },
      { type: "uint256", name: "periodSeconds" },
      { type: "uint256", name: "deposit" },
      { type: "string", name: "title" },
      { type: "string", name: "description" }
    ],
    name: "createStream",
    outputs: [{ type: "uint256", name: "streamId" }],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [{ type: "uint256", name: "streamId" }],
    name: "getStream",
    outputs: [
      {
        type: "tuple",
        components: [
          { type: "uint256", name: "streamId" },
          { type: "address", name: "sender" },
          { type: "address[]", name: "recipients" },
          { type: "address", name: "token" },
          { type: "uint256", name: "deposit" },
          { type: "uint256", name: "startTime" },
          { type: "uint256", name: "endTime" },
          { type: "uint8", name: "status" },
          { type: "uint256", name: "rateLockUntil" },
          { type: "string", name: "title" },
          { type: "string", name: "description" }
        ]
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { type: "uint256", name: "streamId" },
      { type: "address", name: "recipient" }
    ],
    name: "getRecipientInfo",
    outputs: [
      { type: "uint256", name: "ratePerSecond" },
      { type: "uint256", name: "totalWithdrawn" },
      { type: "uint256", name: "lastWithdrawTime" },
      { type: "uint256", name: "currentAccrued" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { type: "uint256", name: "streamId" },
      { type: "address", name: "recipient" }
    ],
    name: "getRecipientBalance",
    outputs: [{ type: "uint256", name: "claimable" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { type: "uint256", name: "streamId" },
      { type: "uint256", name: "offset" },
      { type: "uint256", name: "limit" }
    ],
    name: "getAllRecipientsInfo",
    outputs: [
      {
        type: "tuple[]",
        components: [
          { type: "address", name: "recipient" },
          { type: "uint256", name: "ratePerSecond" },
          { type: "uint256", name: "totalWithdrawn" },
          { type: "uint256", name: "lastWithdrawTime" },
          { type: "uint256", name: "currentAccrued" }
        ]
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ type: "uint256", name: "streamId" }],
    name: "withdrawFromStream",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ type: "address", name: "user" }],
    name: "getRecipientStreams",
    outputs: [{ type: "uint256[]", name: "streamIds" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ type: "address", name: "sender" }],
    name: "getSenderStreams",
    outputs: [{ type: "uint256[]", name: "streamIds" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "streamCounter",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;
