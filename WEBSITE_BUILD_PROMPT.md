# BUILD PROMPT — soundnt.app (crypto checkout + Pro licensing backend)

> Hand this entire document to a fresh Claude (or any engineer). It is the
> complete, authoritative spec for the **soundnt.app** website + backend that
> sells and issues **soundn't Pro** licenses, paid in cryptocurrency, and
> connects to the existing **soundn't** desktop app so purchases auto-activate
> and the operator can see who bought / activated.
>
> This is a **separate repo/project** from the desktop app. Where this spec says
> "the app", it means the already-built Tauri desktop app — you do NOT modify it;
> you must conform to its contract (defined precisely below). A short list of
> app-side changes that the app team will make is included so you know what the
> app will send you.

---

## 0. Mission (read first)

Build `soundnt.app`: a small, fast marketing + **checkout** site with a
**licensing backend**. A buyer picks a Pro term (1/3/6/12 months), pays in
crypto, and the backend mints a **cryptographically signed license token** that
the desktop app verifies **offline**. The site must:

1. Take crypto payments per plan (no merchant-of-record, no cards).
2. On confirmed payment, **mint a signed license token** (exact format below).
3. **Deliver** it to the buyer (auto-activate in the app + email + on-screen).
4. **Track** which install/device bought and activated each license, and support
   **revocation** (refunds/chargeback-equivalents) + **device limits**.
5. Be account-light (the app is a no-account product; identity = license +
   device + optional email).

The single most important correctness requirement: **the license token your
backend signs MUST be accepted by the app's verifier.** Section 2 is law.

---

## 1. The product (context)

**soundn't** is a Windows desktop app for real-time AI microphone noise
suppression (a local, no-account Krisp alternative). It's free to install with a
**7-day Pro trial**; after that, noise suppression is **locked** until a valid,
unexpired Pro license is present.

**Pro is sold as prepaid crypto terms** (crypto is push-based — there's no
card-on-file to auto-charge, so "subscription" = a prepaid pass you re-buy when
it lapses). The pricing ladder (longer term ⇒ cheaper per month):

| Plan id   | Term      | Entitlement days | Price (USD) | Per month | Save |
|-----------|-----------|------------------|-------------|-----------|------|
| `pro_1m`  | 1 month   | 30               | $7.99       | $7.99/mo  | —    |
| `pro_3m`  | 3 months  | 90               | $19.99      | $6.66/mo  | 16%  |
| `pro_6m`  | 6 months  | 180              | $35.99      | $6.00/mo  | 25%  |
| `pro_12m` | 12 months | 365              | $59.99      | $5.00/mo  | 37%  |

This table is the **single source of truth** for price and term. Hardcode it
server-side as `PLANS`; **never trust a price or term sent by the client** —
derive both from the `plan` id.

The app opens checkout in the user's browser at:

```
https://soundnt.app/buy?plan=<planId>&ref=<orderRef>&device=<deviceId>&v=<appVersion>
```

So `/buy` must exist and read those query params (Section 7 / Section 9).

---

## 2. THE LICENSE TOKEN CONTRACT (do not deviate)

The app already ships a verifier. Your backend is the **issuer**. Both halves use
**Ed25519**. The app embeds the **public** key; your server holds the **secret**
key and signs.

### 2.1 Token wire format

```
token = base64url( JSON.stringify(payload) ) + "." + base64url( ed25519_signature )
```

- `base64url` = URL-safe base64, **no padding** (Node's `Buffer.toString("base64url")`).
- The signature is Ed25519 over the **ASCII bytes of the first segment string**
  (the `base64url(payload)` text, i.e. everything before the `.`). This is the
  JWT-style "sign the encoded part" approach — it avoids JSON canonicalization
  issues. Do NOT sign the raw JSON; sign the base64url string bytes.

### 2.2 Payload (exact field names)

```jsonc
{
  "v": 1,                    // schema version, must be 1
  "lic": "SNDT-7QF3K-2M9XA", // your license id (string; support/revocation key)
  "plan": "pro_12m",         // one of pro_1m|pro_3m|pro_6m|pro_12m
  "term_months": 12,         // from PLANS
  "iat": 1750000000,         // issued-at, unix SECONDS
  "exp": 1781536000,         // expiry, unix SECONDS = iat + days*86400
  "email": "buyer@x.com"     // OPTIONAL; omit the key entirely if no email
}
```

- `exp = iat + (PLANS[plan].days * 86400)`. Use UTC unix seconds (integers).
- The app's verifier checks the signature, then `v == 1`. It treats the token as
  expired purely by comparing `exp` to a (rollback-guarded) clock — so a signed
  token with a past `exp` is "authentic but lapsed". Your `/api/order` must only
  hand out unexpired tokens.

### 2.3 Canonical issuer (reuse this verbatim — Node built-in `crypto`, zero deps)

This is the exact logic the app team uses in `tools/issue-license.mjs`. Port it
into your backend (server-only):

```js
import crypto from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

// PLANS — keep identical to Section 1.
const PLANS = {
  pro_1m:  { term_months: 1,  days: 30  },
  pro_3m:  { term_months: 3,  days: 90  },
  pro_6m:  { term_months: 6,  days: 180 },
  pro_12m: { term_months: 12, days: 365 },
};

// privateJwk = { kty:"OKP", crv:"Ed25519", x:"<pub b64url>", d:"<secret b64url>" }
export function signLicense({ lic, plan, email }, privateJwk) {
  const p = PLANS[plan];
  if (!p) throw new Error("unknown plan");
  const key = crypto.createPrivateKey({ key: privateJwk, format: "jwk" });
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    lic,
    plan,
    term_months: p.term_months,
    iat: now,
    exp: now + p.days * 86400,
  };
  if (email) payload.email = String(email);
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(payloadB64, "utf8"), key); // Ed25519 => algorithm null
  return { token: `${payloadB64}.${b64url(sig)}`, payload };
}
```

Verifier (for your own tests — mirrors what the app does):

```js
export function verifyLicense(token, publicXB64url) {
  const [p, s] = token.split(".");
  const pub = crypto.createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: publicXB64url },
    format: "jwk",
  });
  const ok = crypto.verify(null, Buffer.from(p, "utf8"), pub, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("bad signature");
  return JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
}
```

### 2.4 Test vector (anchor your implementation against this)

A known-good token signed by a **dev** key. Your `verifyLicense` MUST accept it
with the dev public key below; this proves your format matches the app.

- Dev public key (`x`, base64url): `YjICy5hhlXqxHsT7pZoe3AXUPqghplWYP48GPOG4YOI`
- Dev token (`pro_12m`, `lic=TEST-12M`):

```
eyJ2IjoxLCJsaWMiOiJURVNULTEyTSIsInBsYW4iOiJwcm9fMTJtIiwidGVybV9tb250aHMiOjEyLCJpYXQiOjE3ODE5NjcwODAsImV4cCI6MTgxMzUwMzA4MCwiZW1haWwiOiJ0ZXN0QHNvdW5kbnQuYXBwIn0.YIWNsDOR0aIdwmR-vNvT3I86uvvF2PL2W8-22BcIbNDB_WHKoUFwBKlQmpn8X-LlXDbARX-fJTUdkZWlr9z9Ag
```

`verifyLicense(devToken, devPubX)` → `{ v:1, lic:"TEST-12M", plan:"pro_12m", term_months:12, iat:1781967080, exp:1813503080, email:"test@soundnt.app" }`. Write this as a unit test.

### 2.5 Production key management (CRITICAL)

The **dev key above is for testing only.** For production:

1. Generate a fresh keypair: `node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('ed25519');console.log(JSON.stringify({pub:publicKey.export({format:'jwk'}),priv:privateKey.export({format:'jwk'})},null,2))"`
   (or run the app repo's `node tools/issue-license.mjs keygen`).
2. The **public** `x` value goes to the **app team** — they paste it into
   `src-tauri/src/license.rs` as `LICENSE_PUBKEY_B64` and ship a new app build.
   The site and the app MUST share the same keypair or tokens won't verify.
3. The **private** JWK (with `d`) goes into your server env as
   `LICENSE_SIGNING_KEY_JWK` (a JSON string). **Never** put it in the client
   bundle, git, logs, or any response. It is the crown jewel — anyone with it can
   mint unlimited Pro. Store it in the host's secret manager (Vercel encrypted env
   / Doppler / etc.).
4. Coordinate the rollout: the app build with the prod pubkey and the live
   backend must go out together. Until then, use the dev key on a staging build.

---

## 3. Tech stack (decisive — swap only with reason)

- **Next.js 15 (App Router) + TypeScript**, deployed on **Vercel**.
- **Tailwind CSS + shadcn/ui** for fast, clean UI. Match the app's aesthetic:
  near-black background (`#0b0c0f`), single **teal** accent `#2bd4a6`, hairline
  borders, flat (no heavy gradients/glow), tabular-nums, system font stack.
- **Postgres** (Neon serverless) + **Drizzle ORM** (typed, lightweight migrations).
- **Resend** for transactional email (license delivery / receipts).
- **Zod** for all input validation.
- **Upstash Redis** (or Vercel KV) for rate limiting + idempotency locks.
- Crypto payments: **NOWPayments** as the primary provider (hosted invoices +
  IPN webhook, 300+ coins, no KYC for the buyer). Abstract it behind a
  `PaymentProvider` interface so **BTCPay Server** (self-hosted, 0-fee) and
  **Coinbase Commerce** can be dropped in. (Rationale: NOWPayments = fastest to
  ship; BTCPay = cheapest/most sovereign once volume justifies hosting it.)

### Project structure

```
soundnt-web/
  app/
    page.tsx                      # landing + pricing
    buy/page.tsx                  # checkout (reads ?plan&ref&device&v)
    buy/success/page.tsx          # post-pay; polls order; shows token
    account/page.tsx              # license lookup via email magic link
    admin/page.tsx                # ops dashboard (token-gated)
    api/
      checkout/route.ts           # POST create order + invoice
      order/[ref]/route.ts        # GET poll order status -> token when paid
      activate/route.ts           # POST register a device activation
      validate/route.ts           # POST periodic re-check / revocation
      recover/route.ts            # POST email a buyer their license(s)
      account/[...]/route.ts      # magic-link issue/verify
      webhooks/nowpayments/route.ts  # IPN -> mint license
      admin/[...]/route.ts        # list/revoke (ADMIN_TOKEN)
  lib/
    license.ts                    # signLicense/verifyLicense (Section 2)
    plans.ts                      # PLANS source of truth
    db/ (schema.ts, client.ts, migrations/)
    payments/ (provider.ts, nowpayments.ts, btcpay.ts, coinbase.ts)
    email.ts                      # Resend templates
    ids.ts                        # license id + ref helpers
    ratelimit.ts
  drizzle.config.ts
  .env.example
  README.md                       # setup + deploy + key rollout runbook
  tests/                          # vitest: token vector, webhook idempotency, plan integrity
```

---

## 4. Data model (Drizzle / Postgres)

```ts
// orders: one per checkout attempt (keyed by the app-supplied ref)
orders {
  id            uuid pk default random
  ref           text unique not null       // order_ref from the app (128-bit)
  plan          text not null              // pro_1m|...
  amount_cents  integer not null           // server-derived from plan
  currency      text not null default 'USD'
  status        text not null default 'pending'  // pending|paid|expired|failed
  provider      text not null              // 'nowpayments'|...
  provider_invoice_id text
  device_id     text                       // from ?device
  email         text
  app_version   text
  license_id    uuid references licenses(id)
  created_at    timestamptz default now()
  paid_at       timestamptz
  expires_at    timestamptz                // pending-order TTL (e.g. +2h)
}

// licenses: one per issued token
licenses {
  id           uuid pk default random
  lic          text unique not null        // 'SNDT-XXXXX-XXXXX'
  plan         text not null
  term_months  integer not null
  days         integer not null
  email        text
  token        text not null               // the signed token (store for re-delivery)
  iat          bigint not null
  exp          bigint not null
  status       text not null default 'active'  // active|revoked|refunded
  order_ref    text
  created_at   timestamptz default now()
  revoked_at   timestamptz
  revoke_reason text
}

// activations: device bindings reported by the app
activations {
  id           uuid pk default random
  license_id   uuid references licenses(id) not null
  device_id    text not null
  device_name  text
  app_version  text
  ip           inet
  first_seen   timestamptz default now()
  last_seen    timestamptz default now()
  count        integer default 1
  // unique (license_id, device_id)
}

// webhook_events: idempotency log
webhook_events {
  id          uuid pk default random
  provider    text not null
  event_id    text not null               // provider's event/payment id
  payload     jsonb not null
  received_at timestamptz default now()
  processed   boolean default false
  // unique (provider, event_id)
}
```

`lic` format: `SNDT-` + two groups of 5 Crockford-base32 chars (no ambiguous
chars), e.g. `SNDT-7QF3K-2M9XA`. `ref` (app-generated) is a UUIDv4/128-bit random
and acts as a **bearer capability** for `GET /api/order/:ref`.

---

## 5. Payment integration (NOWPayments primary)

Abstract behind:

```ts
interface PaymentProvider {
  createInvoice(input: {
    orderRef: string; plan: string; amountUsd: number; // dollars
    successUrl: string; cancelUrl: string;
  }): Promise<{ invoiceId: string; invoiceUrl: string }>;
  verifyWebhook(req: Request, rawBody: string): Promise<
    | { ok: false }
    | { ok: true; eventId: string; orderRef: string; status: 'paid'|'pending'|'failed' }
  >;
}
```

**NOWPayments specifics:**
- Create invoice: `POST https://api.nowpayments.io/v1/invoice` with header
  `x-api-key: NOWPAYMENTS_API_KEY`, body `{ price_amount, price_currency:"usd",
  order_id: orderRef, ipn_callback_url, success_url, cancel_url,
  is_fee_paid_by_user:true }`. Use the returned `invoice_url` (hosted page where
  the buyer picks a coin and pays).
- IPN webhook: NOWPayments POSTs JSON with an `x-nowpayments-sig` header = HMAC
  SHA-512 of the **sorted** JSON body using `NOWPAYMENTS_IPN_SECRET`. **Verify it**
  (sort keys recursively, HMAC, constant-time compare). Reject mismatches.
- Treat `payment_status` ∈ {`finished`, `confirmed`} as **paid**; `partially_paid`
  → keep pending and notify; `failed`/`expired`/`refunded` → mark failed. Require
  the paid amount ≥ invoice amount.
- Map `payment_id`/`invoice_id` → `eventId` for idempotency.

**BTCPay / Coinbase Commerce**: implement the same interface later (BTCPay:
greenfield store + `InvoiceSettled` webhook with HMAC `BTCPAY_WEBHOOK_SECRET`;
Coinbase Commerce: `charge:confirmed` with `X-CC-Webhook-Signature`).

---

## 6. License issuance (the heart)

On a verified **paid** webhook (idempotent via `webhook_events`):

1. Look up the `order` by `ref` (= provider `order_id`). If already `paid` with a
   `license_id`, **return 200 and stop** (idempotent; never double-mint).
2. Generate `lic`. Compute `iat = now`, `exp = iat + PLANS[plan].days*86400`.
3. `signLicense({ lic, plan, email })` → `token`.
4. Insert `licenses` row; update `orders` → `status='paid'`, `paid_at`,
   `license_id`.
5. Email the token (Section 8) if email present.
6. Return 200 fast (do email async if needed). The app's poller (Section 9) will
   pick up the token from `GET /api/order/:ref`.

Refund/abuse: an admin `POST /api/admin/revoke {lic, reason}` sets
`licenses.status='revoked'`; `/api/validate` then returns `revoked` and the app
locks on its next check.

---

## 7. HTTP API (the contract the app depends on)

All JSON. All `4xx`/`5xx` return `{ error: string }`. Rate-limit every endpoint
(per IP + per ref/lic). Validate with Zod. CORS is irrelevant for the app's
calls (it uses a native HTTP client, not a browser), but set permissive CORS only
where a browser page needs it (success page polling).

### `POST /api/checkout`
Create an order + invoice. Called by the `/buy` page (which got `plan/ref/device`
from its URL), or directly by the app.

Request:
```json
{ "plan": "pro_12m", "ref": "5b1e…uuid", "device": "9af3…uuid", "email": "opt@x.com", "appVersion": "0.1.0" }
```
Response `200`:
```json
{ "orderRef": "5b1e…", "invoiceUrl": "https://nowpayments.io/payment/?iid=…",
  "amount": "59.99", "currency": "USD", "plan": "pro_12m", "expiresAt": 1750007200 }
```
Rules: reject unknown `plan`; derive `amount` server-side; if an order with that
`ref` already exists return its existing invoice (idempotent); set
`expires_at = now + 2h`.

### `GET /api/order/:ref`
The app polls this. `ref` is the bearer secret — only the holder gets the token.

Response `200` (pending):
```json
{ "status": "pending" }
```
Response `200` (paid):
```json
{ "status": "paid",
  "license": { "token": "eyJ2Ijox….sig", "lic": "SNDT-7QF3K-2M9XA",
               "plan": "pro_12m", "exp": 1781536000, "email": "opt@x.com" } }
```
Response `200` (expired/failed): `{ "status": "expired" }`.
Never return a token for an unpaid order. Rate-limit hard (e.g. 1 req / 2s / ref).

### `POST /api/activate`
The app calls this right after activating a token, to register the device. Lets
you see/limit installs.

Request:
```json
{ "token": "eyJ2Ijox….sig", "deviceId": "9af3…", "deviceName": "DESKTOP-ABC", "appVersion": "0.1.0" }
```
Behavior: verify the token signature server-side; load license by `lic`; if
`revoked`/`refunded` → `{ "ok": false, "status": "revoked" }`. Upsert
`activations` by `(license_id, device_id)` (bump `last_seen`/`count`). Enforce
`MAX_DEVICES` (default **3**): if a NEW device would exceed it, return
`{ "ok": false, "status": "device_limit", "devicesUsed": 3, "devicesMax": 3 }`.
Else:
```json
{ "ok": true, "status": "active", "plan": "pro_12m", "exp": 1781536000, "devicesUsed": 1, "devicesMax": 3 }
```

### `POST /api/validate`
The app calls this on launch + every few days for revocation/expiry truth.

Request: `{ "lic": "SNDT-7QF3K-2M9XA", "deviceId": "9af3…" }`
Response: `{ "status": "active"|"expired"|"revoked"|"unknown", "exp": 1781536000 }`
Side effect: bump that activation's `last_seen`. Keep this endpoint cheap and
very forgiving (the app treats network failure as "no change", offline-first).

### `POST /api/recover`
`{ "email": "buyer@x.com" }` → always `200 {"ok":true}` (don't leak which emails
exist). If a license matches, email the active token(s).

### `GET /api/admin/orders` · `GET /api/admin/licenses` · `POST /api/admin/revoke`
Gated by header `Authorization: Bearer ADMIN_TOKEN`. Dashboards + revoke. Include
revenue rollups (count/sum by plan, by day).

---

## 8. Email (Resend)

On issuance (and recovery), send a clean dark-themed email:
- Subject: "Your soundn't Pro license".
- Body: thank-you, the **license key** (the token) in a monospace box with a
  copy-friendly block, "Paste it into soundn't → it'll activate. Or just return to
  the app — it activates automatically." Plan + expiry date. A receipt line
  (plan, amount, order ref, date). Support email.
- Sender on a verified `soundnt.app` domain (SPF/DKIM via Resend).

---

## 9. HOW THE APP CONNECTS (end-to-end + app-side changes)

This is the "connect website to the app" part. Two linkage mechanisms:
**order_ref** (ties a purchase to the install that started it) and **device_id**
(ties activations to installs). Both are random per-install UUIDs — privacy-safe,
not hardware fingerprints.

### Purchase → auto-activation sequence

```
APP                         BROWSER                 soundnt.app backend         PROVIDER
 │ user clicks a plan
 │ make order_ref (uuid)
 │ open browser ───────────────────────────────────▶ GET /buy?plan&ref&device&v
 │                          │ page POST /api/checkout ─▶ create order + invoice ─▶ create invoice
 │                          │ ◀───────────────────────  { invoiceUrl }
 │                          │ redirect to invoice ───────────────────────────────▶ buyer pays crypto
 │ poll GET /api/order/ref  │                            ◀── IPN webhook ──────────  payment confirmed
 │   (every ~3s, ~20 min)   │                            mint token, store license
 │ ◀── { status:paid, license:{token} }
 │ activate(token) offline  │
 │ POST /api/activate ──────────────────────────────▶ register device
 │ 🎉 Pro unlocked          │ success page also shows token + emails it (fallbacks)
```

### App-side changes (the app team implements these — listed so your API matches)

1. **device_id**: a per-install UUID persisted in the app config dir
   (`%APPDATA%/com.cleanmic.app/device.json`), created once.
2. **start_checkout**: generate `order_ref` (UUID), open
   `https://soundnt.app/buy?plan=<id>&ref=<ref>&device=<deviceId>&v=<appVersion>`,
   then start polling `GET https://soundnt.app/api/order/<ref>` every ~3s for ~20
   min. On `{status:paid}` → call the existing offline `activate(token)`, then
   `POST /api/activate`, then stop polling and show "Pro unlocked". The existing
   **paste-key** path stays as the manual fallback.
3. **validate loop**: on launch and every ~3 days, if a paid license exists,
   `POST /api/validate {lic, deviceId}`; on `revoked`/`expired` → lock (delete the
   stored token); any network error → keep the current offline verdict (the
   embedded-signature check remains the source of truth for normal expiry).
4. The app's `LICENSE_API_BASE` will be `https://soundnt.app/api`.

You (website) only need to implement the endpoints in Section 7 to these shapes.
Keep them stable; the app depends on the exact field names.

### Who-bought / who-activated visibility (the operator answer)

From these, your admin sees, per license: the buying device (`orders.device_id` +
`activations`), all activated devices, last-seen heartbeats, email (if given),
plan, amount, order, and status. Revoking flips `/api/validate` to `revoked` and
the app self-locks within a few days (or immediately on next launch).

---

## 10. Pages / UX

- **`/` landing**: one screen — what soundn't is, a 30s value pitch, the pricing
  ladder (4 cards, "Best value" on 12-month), a **Download** button, and
  per-plan **Buy** buttons → `/buy?plan=<id>` (no `ref` when started from the web;
  generate a `ref` client-side so web-initiated buys still work, just without app
  auto-activation — they'll use the emailed key). Match the app's flat-teal dark
  look. Mobile-responsive.
- **`/buy`**: read `plan,ref,device,v`. Show plan summary + price + a short "pay
  with crypto" explainer + supported coins. Call `POST /api/checkout`, then
  redirect/embed the provider invoice. Handle missing/invalid `plan` gracefully
  (default to a plan picker). If no `ref` (web visitor), generate one client-side.
- **`/buy/success`**: read `ref`; poll `GET /api/order/:ref`; on paid show the
  license key (copy button), "Return to soundn't — it's unlocking automatically",
  and "we emailed it to you" (if email). Handle still-pending (some coins take
  confirmations) with a friendly "waiting for confirmations" state.
- **`/account`**: email field → magic link (Resend) → list licenses + devices +
  "re-send key" + "deactivate device" (removes an `activations` row, freeing a
  device slot). No passwords.
- **`/admin`**: `ADMIN_TOKEN`-gated. Revenue, recent orders, licenses, search,
  one-click revoke.

---

## 11. Security & correctness checklist

- 🔑 `LICENSE_SIGNING_KEY_JWK` is server-only; never in client bundles, logs, or
  responses. Sign only inside webhook/issuer code paths.
- 🔒 Verify provider webhook signatures (HMAC, constant-time). Reject otherwise.
- ♻️ Idempotency: unique `(provider, event_id)`; never double-mint; minting is a
  single transaction (order→license) guarded by the order's `status`.
- 💵 Derive amount/term from `plan` server-side. Reject unknown plans.
- 🎫 `ref` is a 128-bit secret; `GET /api/order/:ref` only returns a token to its
  holder; expire pending orders (2h). Rate-limit polling, activate, validate,
  recover, checkout.
- 🧱 Zod-validate every input. Parameterized queries (Drizzle). No SQL string
  building.
- 🕵️ Minimal PII (optional email + random device id). Don't fingerprint hardware.
  Add a short privacy note. Allow account/license deletion on request.
- 🌐 HTTPS only (Vercel default). HSTS. Sensible CSP on pages.
- 🧯 Don't log full tokens or the signing key. Log `lic`, `ref`, `order id` only.

---

## 12. Environment variables (`.env.example`)

```
DATABASE_URL=postgres://…neon…
LICENSE_SIGNING_KEY_JWK={"kty":"OKP","crv":"Ed25519","x":"…","d":"…"}   # SECRET
NOWPAYMENTS_API_KEY=…
NOWPAYMENTS_IPN_SECRET=…
RESEND_API_KEY=…
EMAIL_FROM="soundn't <pro@soundnt.app>"
ADMIN_TOKEN=…long-random…
UPSTASH_REDIS_REST_URL=…
UPSTASH_REDIS_REST_TOKEN=…
APP_BASE_URL=https://soundnt.app
MAX_DEVICES=3
PENDING_ORDER_TTL_SECONDS=7200
# optional alt providers
BTCPAY_HOST= …  BTCPAY_API_KEY= …  BTCPAY_STORE_ID= …  BTCPAY_WEBHOOK_SECRET= …
COINBASE_COMMERCE_API_KEY= …  COINBASE_COMMERCE_WEBHOOK_SECRET= …
```

---

## 13. Deployment runbook

1. Create Neon Postgres; run Drizzle migrations.
2. Generate the **production** Ed25519 keypair (Section 2.5). Put the private JWK
   in Vercel env; **send the public `x` to the app team** to embed + ship a new
   app build. **Do not go live until the app build with the prod pubkey is out.**
3. NOWPayments account → API key + IPN secret; set IPN callback to
   `https://soundnt.app/api/webhooks/nowpayments`.
4. Resend → verify `soundnt.app` domain (SPF/DKIM).
5. Vercel project + env vars; custom domain `soundnt.app` (+ `www` redirect); DNS.
6. Smoke test (Section 14) end-to-end on a NOWPayments **sandbox**/small real
   payment before announcing.

---

## 14. Testing & acceptance criteria

Automated (vitest):
- **Token vector**: `verifyLicense(devToken, devPubX)` decodes to the exact object
  in 2.4. `signLicense` then `verifyLicense` round-trips for every plan; `exp` =
  `iat + days*86400`.
- **Plan integrity**: `/api/checkout` ignores client-sent amount/term; unknown
  plan → 400.
- **Webhook idempotency**: replaying the same IPN event mints exactly one license.
- **Order capability**: `GET /api/order/:ref` returns no token while pending; wrong
  ref → no token.
- **Device limit**: 4th distinct device on a 3-cap license → `device_limit`.
- **Revocation**: after admin revoke, `/api/validate` → `revoked`.

Manual acceptance (the real proof):
1. Add a `TEST_MODE` admin action that marks an order paid without real payment,
   so you can mint without spending crypto in dev.
2. Mint a real token from the **live** backend, paste it into the **actual
   soundn't app** → Pro unlocks. (Equivalently, run the app repo's
   `node tools/issue-license.mjs issue --plan pro_12m` with the SAME prod key and
   confirm the app accepts both — they must be interchangeable.)
3. Full path: app "Buy" → browser → pay (sandbox) → app auto-activates within
   seconds via polling; email arrives; success page shows the key; `/admin` shows
   the order + activation device.

Definition of done: a buyer can pay in crypto and the desktop app unlocks Pro
automatically (with email + manual-paste fallbacks), and the operator can see and
revoke every license — using tokens that the unmodified app verifies offline.

---

## 15. Out of scope / future

- No card payments, no merchant-of-record, no full user accounts/passwords.
- No crypto auto-renew (prepaid by design); optional "your Pro expires in 5 days,
  renew" reminder email is a nice future add.
- No mobile app. No i18n initially (USD + English).
- Future: BTCPay self-host to cut fees; affiliate codes; team licenses
  (`devicesMax` > 3 SKUs).

---

## 16. Deliverables

1. The Next.js app implementing Sections 3–11 with the exact API contracts in 7.
2. `lib/license.ts` proven against the 2.4 test vector.
3. Drizzle schema + migrations (Section 4).
4. NOWPayments provider + the `PaymentProvider` interface (stubs for BTCPay/
   Coinbase).
5. Emails (Resend), admin dashboard, account/recover.
6. `README.md` with local-dev, env, the **key-rollout runbook** (2.5/13), and the
   manual acceptance steps (14).
7. Tests (14).

Build it clean, typed, and secure. The token contract (Section 2) is non-
negotiable — when in doubt, make the app's verifier accept your token.
```
