/**
 * Plan integrity at the input boundary (spec §14): checkout never trusts a
 * client-sent amount/term, and unknown plans are rejected.
 */

import { describe, it, expect } from "vitest";
import { checkoutSchema } from "@/lib/validation";
import { PLANS, amountUsd } from "@/lib/plans";

describe("checkout input validation", () => {
  it("ignores any client-sent amount/term fields (not in schema)", () => {
    const parsed = checkoutSchema.parse({
      plan: "pro_12m",
      ref: "abcdef0123456789",
      // attacker-supplied — must be ignored:
      amount: "0.01",
      amount_cents: 1,
      term_months: 999,
      price: 0,
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("amount");
    expect(parsed).not.toHaveProperty("amount_cents");
    expect(parsed).not.toHaveProperty("term_months");
    expect(parsed.plan).toBe("pro_12m");
    // The authoritative price comes from PLANS, not the client.
    expect(amountUsd("pro_12m")).toBe("59.99");
    expect(PLANS.pro_12m.amountCents).toBe(5999);
  });

  it("rejects an unknown plan", () => {
    const res = checkoutSchema.safeParse({ plan: "pro_99m", ref: "abcdef0123456789" });
    expect(res.success).toBe(false);
  });

  it("rejects a missing/short ref", () => {
    expect(checkoutSchema.safeParse({ plan: "pro_1m", ref: "x" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ plan: "pro_1m" }).success).toBe(false);
  });

  it("normalizes email to lowercase and drops empty", () => {
    const a = checkoutSchema.parse({ plan: "pro_1m", ref: "abcdef0123456789", email: " Foo@X.COM " });
    expect(a.email).toBe("foo@x.com");
    const b = checkoutSchema.parse({ plan: "pro_1m", ref: "abcdef0123456789", email: "" });
    expect(b.email).toBeUndefined();
  });
});
