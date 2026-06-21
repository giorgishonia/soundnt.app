/**
 * GET /api/order/:ref — the app polls this; `ref` is the bearer secret. Only the
 * holder gets the token, and only once the order is genuinely paid (spec §7).
 *
 * Browser-facing (the success page polls it too), so it carries permissive read
 * CORS. Unknown/wrong refs return `pending` (never leak existence or a token).
 */

import { json, errorJson, tooMany, withCors, corsPreflight } from "@/lib/http";
import { refParam } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { getOrderView } from "@/lib/services/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(_req: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;

  const parsedRef = refParam.safeParse(ref);
  if (!parsedRef.success) return withCors(errorJson("invalid ref", 400));

  const rl = await rateLimit(LIMITS.orderPoll, parsedRef.data);
  if (!rl.success) return withCors(tooMany(rl.reset));

  const db = getDb();
  const view = await getOrderView(db, parsedRef.data);

  // Unknown ref ⇒ indistinguishable from a not-yet-paid order.
  if (!view) return withCors(json({ status: "pending" }));

  if (view.status === "paid" && view.license) {
    return withCors(
      json({
        status: "paid",
        license: {
          token: view.license.token,
          lic: view.license.lic,
          plan: view.license.plan,
          exp: view.license.exp,
          email: view.license.email ?? undefined,
        },
      })
    );
  }

  if (view.status === "expired") return withCors(json({ status: "expired" }));
  if (view.status === "failed") return withCors(json({ status: "expired" })); // app treats both as terminal
  return withCors(json({ status: "pending" }));
}
