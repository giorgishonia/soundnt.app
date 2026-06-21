/**
 * lib/validation.ts — Zod schemas for every endpoint (spec §7, §11).
 *
 * All inputs are validated here. Crucially, `plan` is the ONLY pricing input we
 * accept — amount/term are always derived server-side from PLANS.
 */

import { z } from "zod";
import { PLAN_ORDER } from "@/lib/plans";

const planEnum = z.enum(PLAN_ORDER as [string, ...string[]]);

// A bearer capability / device id: random token, restricted charset.
const capability = z
  .string()
  .min(8, "ref/id too short")
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, "invalid characters");

const licId = z
  .string()
  .min(6)
  .max(40)
  .regex(/^SNDT-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/i, "invalid license id");

// Validated, normalized (trimmed + lowercased) email.
const requiredEmail = z.string().trim().toLowerCase().email().max(254);

// Same, but "" / missing → undefined.
const optionalEmail = z
  .union([
    z.literal("").transform(() => undefined),
    z.string().trim().toLowerCase().email().max(254),
  ])
  .optional();

const shortText = z.string().max(120).optional();

export const checkoutSchema = z.object({
  plan: planEnum,
  ref: capability,
  device: capability.optional(),
  email: optionalEmail,
  appVersion: shortText,
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const activateSchema = z.object({
  token: z.string().min(20).max(4096),
  deviceId: capability,
  deviceName: shortText,
  appVersion: shortText,
});

export const validateSchema = z.object({
  lic: licId,
  deviceId: capability.optional(),
});

export const recoverSchema = z.object({
  email: requiredEmail,
});

export const accountRequestSchema = z.object({
  email: requiredEmail,
});

export const accountDeactivateSchema = z.object({
  token: z.string().min(10).max(2048),
  lic: licId,
  deviceId: capability,
});

export const revokeSchema = z.object({
  lic: licId,
  reason: z.string().min(1).max(280),
});

export const testPaySchema = z.object({
  ref: capability,
});

export const refParam = capability;
