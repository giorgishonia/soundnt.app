/**
 * The token contract is law (spec §2.4). These tests anchor the issuer to the
 * exact wire format the desktop app verifies offline.
 */

import { describe, it, expect } from "vitest";
import { signLicense, verifyLicense, type Ed25519PrivateJwk } from "@/lib/license";
import { PLANS, PLAN_ORDER, type PlanId } from "@/lib/plans";
import { testKeys } from "./helpers/db";

// Dev vector from spec §2.4.
const DEV_PUB_X = "YjICy5hhlXqxHsT7pZoe3AXUPqghplWYP48GPOG4YOI";
const DEV_TOKEN =
  "eyJ2IjoxLCJsaWMiOiJURVNULTEyTSIsInBsYW4iOiJwcm9fMTJtIiwidGVybV9tb250aHMiOjEyLCJpYXQiOjE3ODE5NjcwODAsImV4cCI6MTgxMzUwMzA4MCwiZW1haWwiOiJ0ZXN0QHNvdW5kbnQuYXBwIn0.YIWNsDOR0aIdwmR-vNvT3I86uvvF2PL2W8-22BcIbNDB_WHKoUFwBKlQmpn8X-LlXDbARX-fJTUdkZWlr9z9Ag";

describe("license token §2.4 vector", () => {
  it("verifies the dev token and decodes to the exact expected payload", () => {
    const decoded = verifyLicense(DEV_TOKEN, DEV_PUB_X);
    expect(decoded).toEqual({
      v: 1,
      lic: "TEST-12M",
      plan: "pro_12m",
      term_months: 12,
      iat: 1781967080,
      exp: 1813503080,
      email: "test@soundnt.app",
    });
  });

  it("rejects a tampered token", () => {
    const tampered = DEV_TOKEN.slice(0, -4) + "AAAA";
    expect(() => verifyLicense(tampered, DEV_PUB_X)).toThrow();
  });
});

describe("sign/verify round-trip", () => {
  const { priv, pubX } = testKeys();

  for (const plan of PLAN_ORDER) {
    it(`round-trips ${plan} with correct exp math`, () => {
      const iat = 1_700_000_000;
      const { token, payload } = signLicense(
        { lic: "SNDT-AAAAA-BBBBB", plan, email: "buyer@x.com", iat },
        priv as Ed25519PrivateJwk
      );
      const back = verifyLicense(token, pubX);
      expect(back).toEqual(payload);
      expect(back.exp).toBe(iat + PLANS[plan].days * 86400);
      expect(back.term_months).toBe(PLANS[plan].termMonths);
      expect(back.v).toBe(1);
    });
  }

  it("omits the email key entirely when no email is given", () => {
    const { token } = signLicense({ lic: "SNDT-AAAAA-BBBBB", plan: "pro_1m" }, priv);
    const back = verifyLicense(token, pubX);
    expect("email" in back).toBe(false);
  });

  it("a token signed with key A does not verify under key B", () => {
    const other = testKeys();
    const { token } = signLicense({ lic: "SNDT-AAAAA-BBBBB", plan: "pro_1m" }, priv);
    expect(() => verifyLicense(token, other.pubX)).toThrow();
  });
});

describe("plan integrity §1", () => {
  const expected: Record<PlanId, { months: number; days: number; cents: number }> = {
    pro_1m: { months: 1, days: 30, cents: 799 },
    pro_3m: { months: 3, days: 90, cents: 1999 },
    pro_6m: { months: 6, days: 180, cents: 3599 },
    pro_12m: { months: 12, days: 365, cents: 5999 },
  };
  for (const plan of PLAN_ORDER) {
    it(`${plan} matches the pricing ladder`, () => {
      expect(PLANS[plan].termMonths).toBe(expected[plan].months);
      expect(PLANS[plan].days).toBe(expected[plan].days);
      expect(PLANS[plan].amountCents).toBe(expected[plan].cents);
    });
  }
});
