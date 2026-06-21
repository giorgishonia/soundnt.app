/** GET /api/admin/activations — list/search device activations (ADMIN_TOKEN gated). */

import { json, tooMany, requireAdmin, clientIp } from "@/lib/http";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { listActivations } from "@/lib/services/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const rl = await rateLimit(LIMITS.admin, clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const db = getDb();
  const activations = await listActivations(db, { q, limit, offset });
  return json({ ok: true, activations });
}
