#!/usr/bin/env node
/**
 * tools/verify-admin.mjs — verify the admin/ops dashboard gating end-to-end.
 * Run against a running dev server:  node --env-file=.env.local tools/verify-admin.mjs
 */
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const SLUG = (process.env.ADMIN_PATH || "").replace(/^\/+|\/+$/g, "").toLowerCase();
const TOKEN = process.env.ADMIN_TOKEN || "";

if (!SLUG || !TOKEN) {
  console.error("✗ ADMIN_PATH / ADMIN_TOKEN not set (run with: node --env-file=.env.local tools/verify-admin.mjs)");
  process.exit(1);
}

async function code(path, headers) {
  let last = "";
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(BASE + path, { headers, redirect: "manual" });
      return r.status;
    } catch (e) {
      last = e.cause?.code || e.message;
      await new Promise((r) => setTimeout(r, 600)); // dev server may still be compiling/settling
    }
  }
  return `ERR(${last})`;
}

const checks = [];
const add = (name, got, want) => checks.push({ name, got, ok: got === want, want });

add(`GET /${SLUG}              secret slug → panel`, await code(`/${SLUG}`), 200);
add(`GET /admin               legacy path is a dead end`, await code(`/admin`), 404);
add(`GET /ops-panel           internal route hidden`, await code(`/ops-panel`), 404);
add(`GET /ops-wrongslug123    wrong slug → nothing`, await code(`/ops-wrongslug123`), 404);
add(`GET /api/admin/orders    no token → blocked`, await code(`/api/admin/orders`), 401);
add(`GET /api/admin/orders    wrong token → blocked`, await code(`/api/admin/orders`, { authorization: `Bearer not-${TOKEN}` }), 401);
add(`GET /api/admin/orders    correct token → allowed`, await code(`/api/admin/orders`, { authorization: `Bearer ${TOKEN}` }), 200);

let allOk = true;
console.log(`\nadmin gating @ ${BASE}   (slug: /${SLUG})\n`);
for (const c of checks) {
  console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}   [${c.got}${c.ok ? "" : ` — expected ${c.want}`}]`);
  if (!c.ok) allOk = false;
}
console.log(allOk ? "\n✓ ALL ADMIN GATING CHECKS PASSED\n" : "\n✗ SOME CHECKS FAILED\n");
process.exit(allOk ? 0 : 1);
