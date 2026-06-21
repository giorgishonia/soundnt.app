/**
 * lib/services/recover.ts — license recovery by email (spec §7 POST /api/recover).
 *
 * The route always responds 200 {ok:true} (don't leak which emails exist); this
 * just returns the active licenses to email, if any.
 */

import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { licenses } from "@/lib/db/schema";
import type { License } from "@/lib/db/schema";

export async function activeLicensesByEmail(db: Db, email: string): Promise<License[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  return db
    .select()
    .from(licenses)
    .where(and(eq(licenses.email, normalized), eq(licenses.status, "active")))
    .orderBy(desc(licenses.exp));
}
