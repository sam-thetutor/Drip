/**
 * copy.ts — central wording for Drip's money-plan framing.
 *
 * Drip is positioned as a personal money-discipline tool: you put money in,
 * split it into "buckets" (bills, people, savings goals) and Drip streams the
 * right amount to each automatically. Keep this vocabulary consistent:
 *
 *   stream      -> plan
 *   recipient   -> bucket / destination
 *   flow rate   -> amount per week/month
 *   deposit     -> money set aside
 *   create      -> set up a plan / allocate
 */

export const BRAND = "Drip";
export const TAGLINE = "Give every shilling a job";

/** Primary navigation labels (routes are unchanged for now). */
export const NAV = {
  home: "Home",
  plans: "Plans",
  allocate: "Allocate",
  profile: "Profile",
  admin: "Admin",
} as const;

/** Shared call-to-action labels. */
export const CTA = {
  newPlan: "Set up a plan",
  addMoney: "Add money",
  cashOut: "Cash out",
  receive: "Receive",
  swap: "Swap",
  allocate: "Allocate money",
} as const;
