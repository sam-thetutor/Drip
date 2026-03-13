// Import ABIs from JSON files
import DripCoreABIJson from "./DripCore.abi.json";
import SubscriptionManagerABIJson from "./SubscriptionManager.abi.json";
import FlowCouncilABIJson from "./FlowCouncil.abi.json";
import DripStakingABIJson from "./DripStaking.abi.json";
import DripStakingV2ABIJson from "./DripStakingV2.abi.json";

// Handle different JSON structures:
// - DripCore.abi.json is an array directly: [...]
// - SubscriptionManager.abi.json is an object with abi property: { abi: [...] }
const DripCoreABI = Array.isArray(DripCoreABIJson)
  ? DripCoreABIJson
  : (DripCoreABIJson as { abi: readonly unknown[] }).abi;

const SubscriptionManagerABI = Array.isArray(SubscriptionManagerABIJson)
  ? SubscriptionManagerABIJson
  : (SubscriptionManagerABIJson as { abi: readonly unknown[] }).abi;

const FlowCouncilABI = Array.isArray(FlowCouncilABIJson)
  ? FlowCouncilABIJson
  : (FlowCouncilABIJson as { abi: readonly unknown[] }).abi;

const DripStakingABI = Array.isArray(DripStakingABIJson)
  ? DripStakingABIJson
  : (DripStakingABIJson as { abi: readonly unknown[] }).abi;

const DripStakingV2ABI = Array.isArray(DripStakingV2ABIJson)
  ? DripStakingV2ABIJson
  : (DripStakingV2ABIJson as { abi: readonly unknown[] }).abi;

// Export ABIs for use in contracts (wagmi expects readonly array)
export const DRIP_CORE_ABI = DripCoreABI as readonly unknown[];
export const SUBSCRIPTION_MANAGER_ABI = SubscriptionManagerABI as readonly unknown[];
export const FLOW_COUNCIL_ABI = FlowCouncilABI as readonly unknown[];
export const DRIP_STAKING_ABI = DripStakingABI as readonly unknown[];
export const DRIP_STAKING_V2_ABI = DripStakingV2ABI as readonly unknown[];

// Re-export for backward compatibility
export { DripCoreABI, SubscriptionManagerABI, FlowCouncilABI, DripStakingABI };

