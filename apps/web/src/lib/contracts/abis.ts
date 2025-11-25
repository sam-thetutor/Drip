// Import ABIs from JSON files
import DripCoreABIJson from "./DripCore.abi.json";
import SubscriptionManagerABIJson from "./SubscriptionManager.abi.json";

// Type assertion for JSON imports
const DripCoreABI = DripCoreABIJson as { abi: readonly unknown[] };
const SubscriptionManagerABI = SubscriptionManagerABIJson as { abi: readonly unknown[] };

export { DripCoreABI, SubscriptionManagerABI };

// Export ABIs as const for better type inference
export const DRIP_CORE_ABI = DripCoreABI.abi as const;
export const SUBSCRIPTION_MANAGER_ABI = SubscriptionManagerABI.abi as const;

