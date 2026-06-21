/**
 * PLANS — the single source of truth for price and term (spec §1).
 *
 * NEVER trust a price or term sent by the client. Always derive both from the
 * `plan` id server-side. This table must stay identical to the issuer in §2.3
 * (term_months / days) and the pricing ladder in §1.
 */

export type PlanId = "pro_1m" | "pro_3m" | "pro_6m" | "pro_12m";

export interface Plan {
  id: PlanId;
  /** Marketing label, e.g. "12 months". */
  term: string;
  /** Months of entitlement (goes into the token payload). */
  termMonths: number;
  /** Entitlement days; exp = iat + days*86400. */
  days: number;
  /** Price in integer cents (server-derived, authoritative). */
  amountCents: number;
  /** Per-month label for marketing cards. */
  perMonth: string;
  /** Savings vs the 1-month plan, for marketing cards. */
  save: string | null;
  /** Whether to highlight this card as "Best value". */
  highlight: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  pro_1m: {
    id: "pro_1m",
    term: "1 month",
    termMonths: 1,
    days: 30,
    amountCents: 799,
    perMonth: "$7.99/mo",
    save: null,
    highlight: false,
  },
  pro_3m: {
    id: "pro_3m",
    term: "3 months",
    termMonths: 3,
    days: 90,
    amountCents: 1999,
    perMonth: "$6.66/mo",
    save: "16%",
    highlight: false,
  },
  pro_6m: {
    id: "pro_6m",
    term: "6 months",
    termMonths: 6,
    days: 180,
    amountCents: 3599,
    perMonth: "$6.00/mo",
    save: "25%",
    highlight: false,
  },
  pro_12m: {
    id: "pro_12m",
    term: "12 months",
    termMonths: 12,
    days: 365,
    amountCents: 5999,
    perMonth: "$5.00/mo",
    save: "37%",
    highlight: true,
  },
};

/** Display order for the pricing ladder (shortest → longest). */
export const PLAN_ORDER: PlanId[] = ["pro_1m", "pro_3m", "pro_6m", "pro_12m"];

export const PLAN_IDS = PLAN_ORDER;

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && value in PLANS;
}

/** Returns the plan or throws — use where an unknown plan is a hard error. */
export function requirePlan(planId: string): Plan {
  if (!isPlanId(planId)) throw new Error(`unknown plan: ${planId}`);
  return PLANS[planId];
}

/** "59.99" — dollars string for invoice creation / display. */
export function amountUsd(planId: PlanId): string {
  return (PLANS[planId].amountCents / 100).toFixed(2);
}

/** 59.99 — dollars number for the payment provider. */
export function amountUsdNumber(planId: PlanId): number {
  return PLANS[planId].amountCents / 100;
}
