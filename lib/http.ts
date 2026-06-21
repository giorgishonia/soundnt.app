/**
 * lib/http.ts — route handler helpers: JSON responses, Zod parsing, client IP,
 * admin auth (constant-time), and CORS for the one browser-facing endpoint.
 *
 * Contract: every 4xx/5xx returns `{ error: string }` (spec §7).
 */

import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { env } from "@/lib/env";

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function errorJson(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function tooMany(reset: number): NextResponse {
  const retryAfter = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 1000)) : 2;
  return NextResponse.json(
    { error: "rate limited" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Parse + validate a JSON body with Zod. On failure returns a 400 response. */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { ok: false, response: errorJson("invalid JSON body", 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "invalid request";
    return { ok: false, response: errorJson(msg, 400) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Best-effort client IP for rate-limit keys.
 *
 * Do NOT trust the LEFTMOST x-forwarded-for entry — on Vercel the platform
 * appends the real edge IP and does not strip client-supplied values, so the
 * leftmost token is attacker-controlled and would let a caller rotate their
 * rate-limit key. Prefer the platform-set `x-real-ip`, else the RIGHTMOST
 * (closest-trusted) XFF entry.
 */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "0.0.0.0";
}

/** Constant-time bearer-token check against ADMIN_TOKEN. */
export function isAdmin(req: Request): boolean {
  const expected = env.adminToken();
  if (!expected) return false; // no admin token configured ⇒ admin locked out
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (!m || !m[1]) return false;
  const got = Buffer.from(m[1]);
  const want = Buffer.from(expected);
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}

/** Returns a 401 response if the request isn't an authenticated admin, else null. */
export function requireAdmin(req: Request): NextResponse | null {
  return isAdmin(req) ? null : errorJson("unauthorized", 401);
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
} as const;

/** Attach permissive read CORS (for the browser success page polling the order). */
export function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
