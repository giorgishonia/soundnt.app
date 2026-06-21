/**
 * lib/ratelimit.ts — per-endpoint rate limiting (Upstash Redis).
 *
 * Every public endpoint is rate-limited (spec §11) by IP and/or by the relevant
 * capability key (ref / lic). When Upstash isn't configured (local dev), the
 * limiter degrades to allow-all with a single startup warning — it never blocks
 * development, and never silently pretends to be protecting production.
 */

import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export interface LimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

type Window = `${number} ${"ms" | "s" | "m" | "h"}`;

interface LimiterSpec {
  name: string;
  requests: number;
  window: Window;
}

const ALLOW_ALL: LimitResult = { success: true, remaining: 999, reset: 0 };

let redis: Redis | null = null;
let warned = false;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = env.upstashUrl();
  const token = env.upstashToken();
  if (!url || !token) {
    if (!warned) {
      log.warn("rate limiting disabled: UPSTASH_REDIS_REST_* not set (dev allow-all)");
      warned = true;
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

const cache = new Map<string, Ratelimit>();

function limiter(spec: LimiterSpec): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  const existing = cache.get(spec.name);
  if (existing) return existing;
  const rl = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(spec.requests, spec.window),
    prefix: `rl:${spec.name}`,
    analytics: false,
  });
  cache.set(spec.name, rl);
  return rl;
}

// Per-endpoint specs (spec §7/§11).
export const LIMITS = {
  checkout: { name: "checkout", requests: 10, window: "60 s" },
  orderPoll: { name: "order", requests: 5, window: "10 s" }, // ~1 req / 2s / ref
  activate: { name: "activate", requests: 20, window: "60 s" },
  validate: { name: "validate", requests: 60, window: "60 s" },
  recover: { name: "recover", requests: 5, window: "60 s" },
  webhook: { name: "webhook", requests: 200, window: "10 s" },
  admin: { name: "admin", requests: 120, window: "60 s" },
  account: { name: "account", requests: 10, window: "60 s" },
} as const satisfies Record<string, LimiterSpec>;

/** Returns `{ success:false }` when the identifier has exceeded the limit. */
export async function rateLimit(
  spec: LimiterSpec,
  identifier: string
): Promise<LimitResult> {
  const rl = limiter(spec);
  if (!rl) return ALLOW_ALL;
  try {
    const r = await rl.limit(identifier);
    return { success: r.success, remaining: r.remaining, reset: r.reset };
  } catch (e) {
    // Never let a limiter outage take the endpoint down — fail open, but log.
    log.error("ratelimit backend error (failing open)", { name: spec.name, err: String(e) });
    return ALLOW_ALL;
  }
}
