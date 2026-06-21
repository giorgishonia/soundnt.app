#!/usr/bin/env node
/**
 * tools/demo-smoke.mjs — end-to-end DEMO crypto → Pro license smoke test.
 *
 * Exercises the exact flow the desktop app drives, with NO real crypto and NO
 * desktop build required:
 *
 *   1. POST /api/checkout         → creates a demo order, returns the demo invoice URL
 *   2. POST /api/demo/pay         → simulates a confirmed payment, mints a signed license
 *   3. GET  /api/order/:ref       → the app's poll; returns the paid license token
 *   4. verify the token OFFLINE   → Ed25519, against the SAME public key embedded in
 *                                   the shipped app (cleanmic/src-tauri/src/license.rs)
 *
 * A green run proves the whole Supabase-backed licensing pipeline works and that the
 * minted token is one the real app will accept offline.
 *
 * Usage (site must be running with DEMO_MODE=true and a Supabase DATABASE_URL):
 *   node tools/demo-smoke.mjs                       # defaults to http://localhost:3000
 *   BASE_URL=https://soundnt-app.vercel.app node tools/demo-smoke.mjs
 *   node tools/demo-smoke.mjs --plan pro_1m
 */

import crypto from "node:crypto";

// The public half of the dev signing key — IDENTICAL to LICENSE_PUBKEY_B64 in
// cleanmic/src-tauri/src/license.rs. If the demo mints with the matching private
// key, this verify passes, which is exactly what the shipped app does offline.
const APP_PUBLIC_X = "YjICy5hhlXqxHsT7pZoe3AXUPqghplWYP48GPOG4YOI";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const PLAN = arg("plan", "pro_12m");
const EMAIL = arg("email", "demo-buyer@example.com");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  teal: (s) => `\x1b[36m${s}\x1b[0m`,
};

function fail(msg, extra) {
  console.error(`\n${c.red("✗ FAILED")} ${msg}`);
  if (extra !== undefined) console.error(c.dim(typeof extra === "string" ? extra : JSON.stringify(extra, null, 2)));
  process.exit(1);
}

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    fail(`${method} ${path} — could not reach the server at ${BASE_URL}. Is \`npm run dev\` running?`, String(e));
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { res, json };
}

/** Offline Ed25519 verify — mirrors lib/license.ts verifyLicense and the Rust app. */
function verifyLicenseToken(token, publicXB64url) {
  const parts = String(token).split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("malformed token");
  const [payloadB64, sigB64] = parts;
  const pub = crypto.createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicXB64url },
    format: "jwk",
  });
  const ok = crypto.verify(null, Buffer.from(payloadB64, "utf8"), pub, Buffer.from(sigB64, "base64url"));
  if (!ok) throw new Error("bad signature — token was NOT signed by the app's key");
  return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
}

async function main() {
  const ref = crypto.randomUUID(); // 128-bit bearer capability (valid checkout ref)
  const device = `smoke-${crypto.randomUUID()}`;

  console.log(c.bold(`\nsoundn't — demo crypto → Pro license smoke test`));
  console.log(c.dim(`base: ${BASE_URL}   plan: ${PLAN}   ref: ${ref}\n`));

  // 0. Health — confirm demo mode + DB + signing key are configured.
  const health = await api("GET", "/api/health");
  if (!health.res.ok) fail("GET /api/health did not return 200", health.json);
  const cfg = health.json.config || {};
  console.log(`${c.teal("①")} health        demoMode=${health.json.demoMode}  db=${cfg.database}  signingKey=${cfg.signingKey}`);
  if (!health.json.demoMode) fail("DEMO_MODE is not true on the server — set DEMO_MODE=true and restart.");
  if (!cfg.database) fail("server reports no DATABASE_URL — set your Supabase connection string and restart.");
  if (!cfg.signingKey) fail("server reports no signing key — set LICENSE_SIGNING_KEY_JWK and restart.");

  // 1. Checkout — creates the demo order + demo invoice.
  const checkout = await api("POST", "/api/checkout", {
    plan: PLAN,
    ref,
    device,
    email: EMAIL,
    appVersion: "smoke-test",
  });
  if (!checkout.res.ok) fail(`POST /api/checkout returned ${checkout.res.status}`, checkout.json);
  if (!checkout.json.invoiceUrl) fail("checkout response missing invoiceUrl", checkout.json);
  console.log(`${c.teal("②")} checkout      $${checkout.json.amount} ${checkout.json.currency} → ${c.dim(checkout.json.invoiceUrl)}`);

  // 2. Demo pay — simulate a confirmed crypto payment; mints a real signed license.
  const pay = await api("POST", "/api/demo/pay", { ref });
  if (pay.res.status === 404) fail("POST /api/demo/pay returned 404 — DEMO_MODE must be true (it gates this endpoint).");
  if (!pay.res.ok) fail(`POST /api/demo/pay returned ${pay.res.status}`, pay.json);
  if (!pay.json.token || !pay.json.lic) fail("demo/pay response missing token/lic", pay.json);
  console.log(`${c.teal("③")} demo/pay      minted ${c.bold(pay.json.lic)}  (outcome: ${pay.json.outcome})`);

  // 3. Order poll — exactly what the desktop app does to fetch the token.
  const order = await api("GET", `/api/order/${encodeURIComponent(ref)}`);
  if (!order.res.ok) fail(`GET /api/order/:ref returned ${order.res.status}`, order.json);
  if (order.json.status !== "paid" || !order.json.license?.token) {
    fail(`order poll did not return a paid license (status: ${order.json.status})`, order.json);
  }
  console.log(`${c.teal("④")} order poll    status=${c.green("paid")}  plan=${order.json.license.plan}`);

  // 4. Offline verification — the real entitlement check the app performs.
  let payload;
  try {
    payload = verifyLicenseToken(order.json.license.token, APP_PUBLIC_X);
  } catch (e) {
    fail(`offline signature verification FAILED: ${e.message}`, order.json.license.token);
  }
  if (payload.plan !== PLAN) fail(`token plan mismatch: expected ${PLAN}, got ${payload.plan}`, payload);

  const expDate = new Date(payload.exp * 1000).toISOString().slice(0, 10);
  console.log(`${c.teal("⑤")} verify        ${c.green("signature OK")}  v=${payload.v}  plan=${payload.plan}  term=${payload.term_months}mo  exp=${expDate}`);

  console.log(c.green(c.bold(`\n✓ PASS — Pro license minted by a demo crypto payment and verified offline.`)));
  console.log(c.dim(`  license id : ${pay.json.lic}`));
  console.log(c.dim(`  token      : ${order.json.license.token.slice(0, 48)}…`));
  console.log(c.dim(`  This is the exact token the soundn't app accepts offline (paste into Settings → Activate license).\n`));
}

main().catch((e) => fail("unexpected error", e?.stack || String(e)));
