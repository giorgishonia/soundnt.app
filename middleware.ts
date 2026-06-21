/**
 * middleware.ts — keeps the ops/admin dashboard hidden.
 *
 * The dashboard page lives at the internal route `/ops-panel`, which is never
 * exposed directly (a direct hit 404s). The panel is reachable ONLY at a secret,
 * env-configured slug (`ADMIN_PATH`): a request to `/<ADMIN_PATH>` is rewritten
 * to `/ops-panel` (with a noindex header so crawlers never surface it). The
 * obvious `/admin` always 404s. This is obscurity layered ON TOP of the
 * ADMIN_TOKEN bearer auth the API routes enforce — not a replacement for it.
 *
 * FAIL-CLOSED: if `ADMIN_PATH` is unset (or invalid), the panel is DISABLED —
 * there is no slug to reach it at, and `/admin` / `/ops-panel` both 404. So a
 * deploy that forgets to set the slug exposes nothing, rather than silently
 * parking the dashboard at the most-guessable path.
 *
 * Caveats (documented in .env.example):
 *  - `ADMIN_PATH` is read at module scope and BAKED INTO the edge bundle at build
 *    time, so changing it requires a REDEPLOY to take effect (it can't be rotated
 *    by an env-only change + restart).
 *  - It must contain only URL-path-safe, dot-free characters; the matcher below
 *    skips any path containing a `.`, so a dotted slug would be unreachable.
 *    Recommended: 10+ random lowercase letters/digits/hyphens.
 */

import { NextResponse, type NextRequest } from "next/server";

const PANEL = "/ops-panel";

// Normalize the configured slug: strip wrapping slashes, lowercase (matching is
// case-insensitive). Empty or dotted ⇒ the panel is disabled.
const RAW = (process.env.ADMIN_PATH ?? "").replace(/^\/+|\/+$/g, "").toLowerCase();
const HAS_DOT = RAW.includes(".");
const ADMIN_PATH = RAW.length > 0 && !HAS_DOT ? RAW : "";
const ENABLED = ADMIN_PATH.length > 0;

if (RAW.length > 0 && HAS_DOT) {
  // eslint-disable-next-line no-console
  console.warn(
    `[middleware] ADMIN_PATH "${RAW}" contains a "." — the route matcher skips dotted ` +
      `paths, so the panel would be unreachable. Using a dot-free slug; admin panel DISABLED.`
  );
} else if (!ENABLED) {
  // eslint-disable-next-line no-console
  console.warn(
    "[middleware] ADMIN_PATH is not set — the ops/admin panel is DISABLED. " +
      "Set ADMIN_PATH to a long random slug to enable it."
  );
}

/** Lowercased pathname with any trailing slash removed (so `/X/` ≡ `/x`). */
function norm(pathname: string): string {
  const p = pathname.replace(/\/+$/, "").toLowerCase();
  return p.length > 0 ? p : "/";
}

export function middleware(req: NextRequest) {
  const p = norm(req.nextUrl.pathname);

  // Secret slug → serve the panel. URL stays secret; the rewrite is internal and
  // does not re-enter middleware.
  if (ENABLED && p === `/${ADMIN_PATH}`) {
    const url = req.nextUrl.clone();
    url.pathname = PANEL;
    const res = NextResponse.rewrite(url);
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return res;
  }

  // The internal route and the obvious /admin are always dead ends.
  if (p === PANEL || p === "/admin") {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

// Run on everything except API routes, Next internals, and static assets (any
// path containing a `.`). The secret slug must therefore be dot-free.
export const config = { matcher: ["/((?!api/|_next/|.*\\..*).*)"] };
