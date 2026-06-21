# soundnt.app — crypto checkout + Pro licensing backend

The marketing + **checkout** site and **licensing backend** for **soundn't** (a local,
no-account AI mic noise-suppression desktop app). A buyer picks a Pro term, pays in crypto,
and the backend mints a **cryptographically signed license token** that the desktop app
verifies **offline**. Tokens are interchangeable with the app team's `tools/issue-license.mjs`
as long as both share the same Ed25519 keypair.

> The token contract (license wire format) is **law**. See [`lib/license.ts`](lib/license.ts)
> and the anchoring test [`tests/license.test.ts`](tests/license.test.ts), which verifies the
> exact known-good vector from the build spec (§2.4).

> 🧪 **Just want the demo running on `soundnt.netlify.app` (crypto checkout that
> takes no real money)?** Follow [`DEMO_SETUP.md`](DEMO_SETUP.md). It uses
> `DEMO_MODE=true` to simulate payments while still minting real, app-verifiable
> licenses.

---

## Stack

- **Next.js 15** (App Router) + **TypeScript**, deploy on **Vercel**
- **Postgres** (Neon serverless) + **Drizzle ORM** (typed migrations)
- **Zod** validation · **Resend** email · **Upstash Redis** rate limiting
- Payments: **NOWPayments** (primary) behind a `PaymentProvider` interface;
  **BTCPay** + **Coinbase Commerce** stubs implement the same interface
- Ed25519 license signing via Node's built-in `crypto` (zero crypto deps)

## Project layout

```
app/
  page.tsx                  landing + pricing ladder
  buy/                      checkout (reads ?plan&ref&device&v) + success poller
  account/                  magic-link license lookup (no passwords)
  admin/                    ADMIN_TOKEN-gated ops dashboard
  privacy/                  privacy note
  api/
    checkout, order/[ref], activate, validate, recover,
    account/{request,session,deactivate},
    webhooks/nowpayments, admin/{orders,licenses,license/[lic],revenue,revoke,test-pay},
    health
lib/
  license.ts                signLicense / verifyLicense (THE contract, §2)
  plans.ts                  PLANS — single source of truth for price + term
  env.ts                    server-only env access
  validation.ts             Zod schemas for every endpoint
  db/ (schema, client, migrations)
  payments/ (provider, nowpayments, nowpayments-sig, btcpay, coinbase, index)
  services/ (orders, issue, activations, validate, recover, admin, account)
  email.ts, ratelimit.ts, http.ts, ids.ts, log.ts, utils.ts
components/                 shadcn-style UI primitives + site chrome
tests/                      vitest suite (pglite-backed) — see Testing
tools/keygen.mjs            production keypair generator
```

---

## Local development

```bash
npm install
cp .env.example .env.local        # fill in values (see below)
npm run keygen                     # generate a dev/prod Ed25519 keypair
npm run db:generate                # (already generated) regenerate migration SQL after schema edits
npm run db:migrate                 # apply migrations to your Neon DB (needs DATABASE_URL)
npm run dev                        # http://localhost:3000
```

Minimum env to boot the app and exercise minting locally (`.env.local`):

```
DATABASE_URL=postgres://…neon…           # a Neon (or any Postgres) database
LICENSE_SIGNING_KEY_JWK={"kty":"OKP",…}  # from `npm run keygen` (the PRIVATE JWK)
ADMIN_TOKEN=<long-random>
ALLOW_TEST_MODE=true                      # enables /api/admin/test-pay (NEVER in prod)
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
```

NOWPayments / Resend / Upstash are optional for local dev:
- No Upstash → rate limiting no-ops (logged warning).
- No Resend → emails are a logged no-op.
- No NOWPayments → use TEST_MODE (below) to mint without a real payment.

Check config presence anytime: `GET /api/health`.

---

## The license token contract (§2 — do not deviate)

```
token = base64url(JSON(payload)) + "." + base64url(ed25519_signature)
```

- `base64url` is URL-safe, **no padding**.
- The signature is Ed25519 over the **ASCII bytes of the first segment string**
  (`base64url(payload)`), JWT-style — NOT over the raw JSON.
- Payload: `{ v:1, lic, plan, term_months, iat, exp, email? }`, `exp = iat + days*86400`
  (UTC unix seconds). The `email` key is omitted entirely when absent.

`lib/license.ts` is a verbatim port of the app team's issuer logic. The test suite proves it
against the spec's known-good dev vector and round-trips every plan.

### Production key management (CRITICAL — §2.5)

1. `npm run keygen` → prints the **public x** and the **private JWK**.
2. Send the **public x** to the app team. They embed it in `src-tauri/src/license.rs`
   as `LICENSE_PUBKEY_B64` and ship a **new app build**.
3. Put the **private JWK** in the server env as `LICENSE_SIGNING_KEY_JWK` (Vercel encrypted env
   / Doppler / a secret manager). **Never** put it in the client bundle, git, logs, or any
   response. Anyone with it can mint unlimited Pro.
4. **Do not go live until the app build with the prod pubkey is shipped.** Until then, use a
   dev key on a staging app build. The site and app MUST share the same keypair.

---

## HTTP API (the contract the app depends on)

All JSON; every 4xx/5xx is `{ error: string }`. Rate-limited per IP and per ref/lic.

| Method & path | Purpose |
|---|---|
| `POST /api/checkout` | Create order + invoice. Body `{ plan, ref, device?, email?, appVersion? }` → `{ orderRef, invoiceUrl, amount, currency, plan, expiresAt }`. Amount/term derived server-side; unknown plan → 400; idempotent on `ref`. |
| `GET /api/order/:ref` | App polls. `ref` is a bearer secret. `{status:'pending'}` \| `{status:'paid', license:{token,lic,plan,exp,email?}}` \| `{status:'expired'}`. Never returns a token for an unpaid order. |
| `POST /api/activate` | Register a device. Verifies signature, enforces `MAX_DEVICES` (default 3), honors revocation. |
| `POST /api/validate` | Launch/heartbeat revocation+expiry check. `{status:'active'\|'expired'\|'revoked'\|'unknown', exp?}`. Forgiving by design. |
| `POST /api/recover` | `{email}` → always `{ok:true}` (no email enumeration); emails active token(s) if any. |
| `POST /api/account/request` · `GET /api/account/session` · `POST /api/account/deactivate` | Passwordless magic-link account: list licenses + devices, free a device slot. |
| `POST /api/webhooks/nowpayments` | IPN → verify HMAC → mint license (idempotent). |
| `GET /api/admin/{orders,licenses,license/:lic,revenue}` · `POST /api/admin/{revoke,test-pay}` | `Authorization: Bearer ADMIN_TOKEN`. Dashboards + revoke + TEST_MODE. |

### How the app connects (§9)

`order_ref` ties a purchase to the install that started it; `device_id` ties activations to
installs (both random per-install UUIDs — not hardware fingerprints). The app opens
`/buy?plan=…&ref=…&device=…&v=…`, polls `GET /api/order/:ref`, then on `paid` calls the offline
`activate(token)` and `POST /api/activate`. From `orders.device_id` + `activations`, the admin
can see who bought and who activated each license; revocation flips `/api/validate` to `revoked`
and the app self-locks on its next check.

---

## Idempotency & correctness notes

- **No double-mint.** The Neon HTTP driver has no interactive transactions, so issuance relies
  on (1) a unique `webhook_events(provider,event_id)` log to dedup re-deliveries and (2) a
  conditional `UPDATE orders SET status='paid' … WHERE status<>'paid'` that claims the order
  exactly once (Postgres row-locks serialize concurrent claims). Only the winner mints. Proven
  in `tests/issue.test.ts`.
- **No stranded payments.** Because the claim and the license-insert are separate commits, a
  crash between them could leave an order `paid` with no license. Re-delivery (or any later
  webhook) detects a paid-but-unminted order and converges it via the idempotent `mintForOrder`,
  so a paying buyer always ends up with a license. Regression-tested.
- **Underpayment guard.** Beyond mapping `partially_paid → pending`, issuance refuses to mint
  when the IPN's `actually_paid < pay_amount` (or the invoice's `price_amount` doesn't match the
  order), as defense-in-depth against tolerance/fee edge cases.
- **Webhook auth.** NOWPayments IPN is verified with HMAC-SHA512 over the recursively
  key-sorted JSON body, constant-time compared (`lib/payments/nowpayments-sig.ts`,
  `tests/nowpayments-sig.test.ts`). Mismatches are rejected.
- **Server-derived pricing.** Amount/term come only from `PLANS[plan]`. Client-sent amounts are
  ignored; unknown plans rejected (`tests/checkout-validation.test.ts`).
- **Secret hygiene.** The signing key and tokens are never logged (`lib/log.ts`). `.env*` is
  gitignored.

---

## Deployment runbook (§13)

1. **Neon**: create a Postgres database; set `DATABASE_URL`; run `npm run db:migrate`.
2. **Keys**: `npm run keygen`. Put the private JWK in Vercel env as `LICENSE_SIGNING_KEY_JWK`;
   send the public x to the app team to embed + ship. **Don't go live until the app build is out.**
3. **NOWPayments**: create an account → API key + IPN secret. Set the IPN callback to
   `https://soundnt.app/api/webhooks/nowpayments`. Set `NOWPAYMENTS_API_KEY` / `NOWPAYMENTS_IPN_SECRET`.
4. **Resend**: verify the `soundnt.app` domain (SPF/DKIM). Set `RESEND_API_KEY` / `EMAIL_FROM`.
5. **Upstash**: create a Redis DB; set `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
6. **Vercel**: import the repo, add all env vars, set the custom domain `soundnt.app` (+ `www`
   redirect). Set `ADMIN_TOKEN`, `APP_BASE_URL`, `NEXT_PUBLIC_APP_BASE_URL`, leave
   `ALLOW_TEST_MODE` unset/false.
7. Smoke test (below) before announcing.

---

## Testing & acceptance (§14)

```bash
npm test          # vitest — pglite-backed, no external services needed
npm run typecheck # tsc --noEmit
npm run build     # next build
```

Automated coverage (all green): token §2.4 vector + round-trips, plan integrity, checkout
ignores client amount / rejects unknown plan, webhook idempotency (exactly one mint across
replays and status transitions), order capability (no token while pending), device limit
(4th device blocked), revocation, validate status, NOWPayments HMAC, account magic-link authz.

**Manual acceptance:**
1. **Mint without paying.** With `ALLOW_TEST_MODE=true`, create an order (open `/buy?plan=pro_12m`
   and click Continue, or `POST /api/checkout`), then
   `POST /api/admin/test-pay { "ref": "<orderRef>" }` with the admin bearer token. It returns the
   `lic` + `token`.
2. **Verify the app accepts it.** Paste that token into the actual soundn't app → Pro unlocks.
   It must be interchangeable with `node tools/issue-license.mjs issue --plan pro_12m` signed by
   the **same** key.
3. **Full path.** App "Buy" → browser → pay (NOWPayments small/sandbox payment) → app
   auto-activates within seconds via polling; the email arrives; the success page shows the key;
   `/admin` shows the order + activation device.

**Definition of done:** a buyer pays in crypto and the desktop app unlocks Pro automatically
(with email + manual-paste fallbacks), and the operator can see and revoke every license — using
tokens the unmodified app verifies offline.

---

## Out of scope (§15)

No cards / merchant-of-record / passwords / auto-renew (crypto is prepaid by design). Future:
BTCPay self-host to cut fees, renewal-reminder emails, affiliate codes, team-license SKUs
(`devicesMax` > 3).
