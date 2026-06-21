/**
 * lib/env.ts — server-only environment access.
 *
 * Centralizes reading + light validation of env vars so routes/services don't
 * sprinkle `process.env` everywhere. Secret values (signing key, API keys) are
 * only ever read here and in the code paths that need them — never returned to
 * a client or logged.
 */

import "server-only";
import crypto from "node:crypto";
import type { Ed25519PrivateJwk } from "@/lib/license";

function get(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function require(name: string): string {
  const v = get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function int(name: string, fallback: number): number {
  const v = get(name);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  /**
   * Postgres connection string. Prefers an explicit DATABASE_URL, but also
   * accepts NETLIFY_DATABASE_URL — the var Netlify's built-in Neon database
   * integration injects automatically — so a Netlify deploy can work zero-config.
   */
  databaseUrl: () =>
    get("DATABASE_URL") ??
    get("NETLIFY_DATABASE_URL") ??
    get("NETLIFY_DATABASE_URL_UNPOOLED") ??
    require("DATABASE_URL"),

  /** The crown-jewel signing key. Parsed + validated lazily; throws if absent. */
  signingKey(): Ed25519PrivateJwk {
    const raw = require("LICENSE_SIGNING_KEY_JWK");
    let jwk: unknown;
    try {
      jwk = JSON.parse(raw);
    } catch {
      throw new Error("LICENSE_SIGNING_KEY_JWK is not valid JSON");
    }
    const k = jwk as Partial<Ed25519PrivateJwk>;
    if (k.kty !== "OKP" || k.crv !== "Ed25519" || !k.x || !k.d) {
      throw new Error(
        "LICENSE_SIGNING_KEY_JWK must be an Ed25519 OKP private JWK with x and d"
      );
    }
    return k as Ed25519PrivateJwk;
  },

  /** Public `x` of the signing key — safe to expose (it's the verify key). */
  signingPublicX(): string {
    return this.signingKey().x;
  },

  nowpaymentsApiKey: () => get("NOWPAYMENTS_API_KEY"),
  nowpaymentsIpnSecret: () => get("NOWPAYMENTS_IPN_SECRET"),

  resendApiKey: () => get("RESEND_API_KEY"),
  emailFrom: () => get("EMAIL_FROM") ?? "soundn't <pro@soundnt.app>",
  supportEmail: () => get("SUPPORT_EMAIL") ?? "support@soundnt.app",

  adminToken: () => get("ADMIN_TOKEN"),

  /**
   * Secret for signing stateless account magic-link tokens. Prefer a dedicated
   * ACCOUNT_LINK_SECRET. If only ADMIN_TOKEN is set, derive a SEPARATE one-way
   * key from it (never reuse the admin bearer token verbatim across trust
   * boundaries) so the feature still works zero-config without coupling secrets.
   */
  accountLinkSecret(): string | undefined {
    const dedicated = get("ACCOUNT_LINK_SECRET");
    if (dedicated) return dedicated;
    const admin = get("ADMIN_TOKEN");
    if (!admin) return undefined;
    return crypto
      .createHash("sha256")
      .update("soundnt-account-link-v1:" + admin)
      .digest("base64url");
  },

  upstashUrl: () => get("UPSTASH_REDIS_REST_URL"),
  upstashToken: () => get("UPSTASH_REDIS_REST_TOKEN"),

  appBaseUrl: () =>
    get("APP_BASE_URL") ??
    get("NEXT_PUBLIC_APP_BASE_URL") ??
    get("URL") ?? // Netlify sets URL to the site's primary address at build/runtime
    "https://soundnt.netlify.app",

  maxDevices: () => int("MAX_DEVICES", 3),
  pendingOrderTtlSeconds: () => int("PENDING_ORDER_TTL_SECONDS", 7200),

  allowTestMode: () => get("ALLOW_TEST_MODE") === "true",

  /**
   * DEMO mode: payments are simulated (no real crypto). Enables the demo payment
   * provider + the self-serve `POST /api/demo/pay` mint endpoint. NEVER true on a
   * real store — it gives away Pro licenses for free.
   */
  demoMode: () => get("DEMO_MODE") === "true",

  btcpay: () => ({
    host: get("BTCPAY_HOST"),
    apiKey: get("BTCPAY_API_KEY"),
    storeId: get("BTCPAY_STORE_ID"),
    webhookSecret: get("BTCPAY_WEBHOOK_SECRET"),
  }),
  coinbase: () => ({
    apiKey: get("COINBASE_COMMERCE_API_KEY"),
    webhookSecret: get("COINBASE_COMMERCE_WEBHOOK_SECRET"),
  }),
};
