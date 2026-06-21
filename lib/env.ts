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

/**
 * The shared DEV signing key's PUBLIC x — it is published in DEMO_SETUP.md and
 * embedded in the shipped app, so its private half is effectively public. Fine
 * for the demo, but it must NEVER sign licenses in a real (non-demo) store.
 */
const DEV_SIGNING_PUBLIC_X = "YjICy5hhlXqxHsT7pZoe3AXUPqghplWYP48GPOG4YOI";

export const env = {
  /**
   * Postgres connection string — the Supabase Supavisor *transaction* pooler URL
   * for serverless (host aws-0-<region>.pooler.supabase.com, user
   * postgres.<project-ref>, port 6543, ?sslmode=require). Required; we read ONLY
   * DATABASE_URL (no NETLIFY_DATABASE_URL fallback) so an unset value fails loudly
   * instead of silently routing to a stale Netlify-injected database.
   */
  databaseUrl: () => require("DATABASE_URL"),

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
    // Fail loud if the shared DEV key is used in a real (non-demo) store — its
    // private half is public, so it could forge unlimited Pro licenses.
    if (k.x === DEV_SIGNING_PUBLIC_X && !this.demoMode()) {
      throw new Error(
        "Refusing the shared DEV signing key with DEMO_MODE off — run `npm run keygen`, embed the new public x in the app and ship a build, then set LICENSE_SIGNING_KEY_JWK to the new private JWK."
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
   * Secret URL slug the ops dashboard is served at (trimmed of slashes,
   * lowercased). The actual routing lives in `middleware.ts` (which reads
   * process.env directly so it can be build-inlined into the edge bundle); this
   * accessor mirrors that normalization for any server-side use. Fail-closed:
   * unset / dotted ⇒ `undefined` (panel disabled).
   */
  adminPath: (): string | undefined => {
    const raw = get("ADMIN_PATH")?.replace(/^\/+|\/+$/g, "").toLowerCase();
    return raw && raw.length > 0 && !raw.includes(".") ? raw : undefined;
  },

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
    "https://soundnt-app.vercel.app",

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
