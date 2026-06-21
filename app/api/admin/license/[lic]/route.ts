/** GET /api/admin/license/:lic — full detail: order, devices, status (gated). */

import { json, errorJson, tooMany, requireAdmin, clientIp } from "@/lib/http";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { getLicenseDetail } from "@/lib/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ lic: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const rl = await rateLimit(LIMITS.admin, clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

  const { lic } = await ctx.params;
  const db = getDb();
  const detail = await getLicenseDetail(db, lic);
  if (!detail) return errorJson("not found", 404);
  return json({ ok: true, ...detail });
}
