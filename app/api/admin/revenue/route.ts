/** GET /api/admin/revenue — revenue rollups by plan + by day (gated). */

import { json, tooMany, requireAdmin, clientIp } from "@/lib/http";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { revenueRollup } from "@/lib/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const rl = await rateLimit(LIMITS.admin, clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

  const db = getDb();
  const rollup = await revenueRollup(db);
  return json({ ok: true, ...rollup });
}
