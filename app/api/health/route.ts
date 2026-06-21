/** GET /api/health — liveness probe. Reports config presence WITHOUT secrets. */

import { json } from "@/lib/http";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  let signingKeyOk = false;
  try {
    signingKeyOk = Boolean(env.signingPublicX());
  } catch {
    signingKeyOk = false;
  }
  let databaseOk = false;
  try {
    databaseOk = Boolean(env.databaseUrl());
  } catch {
    databaseOk = false;
  }

  return json({
    ok: true,
    service: "soundnt",
    demoMode: env.demoMode(),
    config: {
      database: databaseOk,
      signingKey: signingKeyOk,
      nowpayments: Boolean(env.nowpaymentsApiKey() && env.nowpaymentsIpnSecret()),
      resend: Boolean(env.resendApiKey()),
      admin: Boolean(env.adminToken()),
      rateLimiting: Boolean(env.upstashUrl() && env.upstashToken()),
    },
  });
}
