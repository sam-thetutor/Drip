"use client";

import { useMemo } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { getContractAddress } from "../config";

const PHONE_MAPPING_ABI = [
  {
    type: "function",
    name: "registerPhone",
    stateMutability: "nonpayable",
    inputs: [{ name: "phoneHash", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "registerPhoneSecure",
    stateMutability: "nonpayable",
    inputs: [
      { name: "phoneHash", type: "bytes32" },
      { name: "encryptedPhoneData", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateEncryptedPhoneData",
    stateMutability: "nonpayable",
    inputs: [{ name: "encryptedPhoneData", type: "bytes" }],
    outputs: [],
  },
  {
    type: "function",
    name: "unregisterPhone",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveAddressByPhone",
    stateMutability: "view",
    inputs: [{ name: "phoneHash", type: "bytes32" }],
    outputs: [{ name: "user", type: "address" }],
  },
  {
    type: "function",
    name: "resolvePhoneByAddress",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "phoneHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getEncryptedPhoneByAddress",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "encryptedPhoneData", type: "bytes" }],
  },
  {
    type: "function",
    name: "isPhoneRegistered",
    stateMutability: "view",
    inputs: [{ name: "phoneHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isAddressPhoneRegistered",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function usePhoneMapping() {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const contractAddress = useMemo(() => {
    return getContractAddress(chainId, "DripCore");
  }, [chainId]);

  const {
    data: mappedPhoneHash,
    refetch: refetchMappedPhoneHash,
    isLoading: mappedPhoneHashLoading,
  } = useReadContract({
    address: contractAddress || undefined,
    abi: PHONE_MAPPING_ABI,
    functionName: "resolvePhoneByAddress",
    args: address ? [address] : undefined,
    query: {
      enabled: !!contractAddress && !!address,
    },
  });

  const {
    data: isAddressRegistered,
    refetch: refetchIsAddressRegistered,
    isLoading: isAddressRegisteredLoading,
  } = useReadContract({
    address: contractAddress || undefined,
    abi: PHONE_MAPPING_ABI,
    functionName: "isAddressPhoneRegistered",
    args: address ? [address] : undefined,
    query: {
      enabled: !!contractAddress && !!address,
    },
  });

  const {
    data: encryptedPhoneData,
    refetch: refetchEncryptedPhoneData,
    isLoading: encryptedPhoneDataLoading,
  } = useReadContract({
    address: contractAddress || undefined,
    abi: PHONE_MAPPING_ABI,
    functionName: "getEncryptedPhoneByAddress",
    args: address ? [address] : undefined,
    query: {
      enabled: !!contractAddress && !!address,
    },
  });

  const registerPhone = async (phoneHash: `0x${string}`) => {
    if (!contractAddress) throw new Error("DripCore contract not found on this network");

    return writeContract({
      address: contractAddress,
      abi: PHONE_MAPPING_ABI,
      functionName: "registerPhone",
      args: [phoneHash],
    });
  };

  const unregisterPhone = async () => {
    if (!contractAddress) throw new Error("DripCore contract not found on this network");

    return writeContract({
      address: contractAddress,
      abi: PHONE_MAPPING_ABI,
      functionName: "unregisterPhone",
      args: [],
    });
  };

  const registerPhoneSecure = async (phoneHash: `0x${string}`, encryptedPhoneDataHex: `0x${string}`) => {
    if (!contractAddress) throw new Error("DripCore contract not found on this network");

    return writeContract({
      address: contractAddress,
      abi: PHONE_MAPPING_ABI,
      functionName: "registerPhoneSecure",
      args: [phoneHash, encryptedPhoneDataHex],
    });
  };

  const updateEncryptedPhoneData = async (encryptedPhoneDataHex: `0x${string}`) => {
    if (!contractAddress) throw new Error("DripCore contract not found on this network");

    return writeContract({
      address: contractAddress,
      abi: PHONE_MAPPING_ABI,
      functionName: "updateEncryptedPhoneData",
      args: [encryptedPhoneDataHex],
    });
  };

  const resolveAddressByPhoneHash = async (phoneHash: `0x${string}`): Promise<`0x${string}` | null> => {
    if (!contractAddress || !publicClient) return null;

    try {
      const resolved = (await publicClient.readContract({
        address: contractAddress,
        abi: PHONE_MAPPING_ABI,
        functionName: "resolveAddressByPhone",
        args: [phoneHash],
      })) as `0x${string}`;

      if (!resolved || resolved.toLowerCase() === ZERO_ADDRESS) return null;
      return resolved;
    } catch {
      return null;
    }
  };

  const isPhoneHashRegistered = async (phoneHash: `0x${string}`): Promise<boolean> => {
    if (!contractAddress || !publicClient) return false;

    try {
      return (await publicClient.readContract({
        address: contractAddress,
        abi: PHONE_MAPPING_ABI,
        functionName: "isPhoneRegistered",
        args: [phoneHash],
      })) as boolean;
    } catch {
      return false;
    }
  };

  const hasMappedPhoneHash =
    !!mappedPhoneHash &&
    typeof mappedPhoneHash === "string" &&
    mappedPhoneHash.toLowerCase() !== ZERO_HASH;

  return {
    contractAddress,
    registerPhone,
    registerPhoneSecure,
    unregisterPhone,
    updateEncryptedPhoneData,
    resolveAddressByPhoneHash,
    isPhoneHashRegistered,
    mappedPhoneHash: mappedPhoneHash as `0x${string}` | undefined,
    hasMappedPhoneHash,
    isAddressRegistered: Boolean(isAddressRegistered),
    refetchMappedPhoneHash,
    refetchIsAddressRegistered,
    encryptedPhoneData: encryptedPhoneData as `0x${string}` | undefined,
    refetchEncryptedPhoneData,
    mappedPhoneHashLoading,
    isAddressRegisteredLoading,
    encryptedPhoneDataLoading,
    hash,
    isPending,
    isConfirming,
    isConfirmed,
    error,
  };
}
