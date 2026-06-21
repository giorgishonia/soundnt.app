/** POST /api/admin/revoke — revoke a license (refund/abuse). Gated (spec §6). */

import { parseBody, json, errorJson, tooMany, requireAdmin, clientIp } from "@/lib/http";
import { revokeSchema } from "@/lib/validation";
import { rateLimit, LIMITS } from "@/lib/ratelimit";
import { getDb } from "@/lib/db/client";
import { revokeLicense } from "@/lib/services/admin";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const rl = await rateLimit(LIMITS.admin, clientIp(req));
  if (!rl.success) return tooMany(rl.reset);

  const parsed = await parseBody(req, revokeSchema);
  if (!parsed.ok) return parsed.response;

  const db = getDb();
  const updated = await revokeLicense(db, parsed.data.lic, parsed.data.reason);
  if (!updated) return errorJson("license not found", 404);

  log.info("license revoked", { lic: parsed.data.lic, reason: parsed.data.reason });
  return json({ ok: true, lic: updated.lic, status: updated.status });
}
