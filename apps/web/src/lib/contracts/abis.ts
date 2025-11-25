// Import ABIs from JSON files
import DripCoreABIJson from "./DripCore.abi.json";
import SubscriptionManagerABIJson from "./SubscriptionManager.abi.json";

// Type assertion for JSON imports
const DripCoreABI = DripCoreABIJson as { abi: readonly unknown[] };
const SubscriptionManagerABI = SubscriptionManagerABIJson as { abi: readonly unknown[] };

export { DripCoreABI, SubscriptionManagerABI };

// Export ABIs for use in contracts
export const DRIP_CORE_ABI = DripCoreABI.abi;
export const SUBSCRIPTION_MANAGER_ABI = SubscriptionManagerABI.abi;

