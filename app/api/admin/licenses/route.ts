/** GET /api/admin/licenses — list/search licenses (ADMIN_TOKEN gated). */

import { json, tooMany, requireAdmin, clientIp } from "@/lib/http";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { listLicenses } from "@/lib/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const rl = await rateLimit(LIMITS.admin, clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const db = getDb();
  const licenses = await listLicenses(db, { q, limit, offset });
  return json({ ok: true, licenses });
}
