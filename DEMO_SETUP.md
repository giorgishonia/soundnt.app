# Demo setup — crypto payment without real money

This wires the **website** (`soundntwebsite`, deployed at `https://soundnt-app.vercel.app`)
and the **desktop app** (`cleanmic`) so the full crypto-checkout flow works **as a
demo**: nobody spends crypto, but the app still unlocks Pro automatically with a
real, signed license.

## How the demo works

```
app "Buy"  ──▶  browser: soundnt-app.vercel.app/buy?plan&ref&device&v
                     │  POST /api/checkout  (demo provider)
                     ▼
              /buy/demo-pay  ──▶  "Simulate payment & unlock"
                     │  POST /api/demo/pay   (mints a real signed license, no crypto)
                     ▼
              /buy/success  (shows the key)
   app polls GET /api/order/:ref ──▶ paid + token ──▶ Pro unlocks automatically
```

`DEMO_MODE=true` does two things:
- makes the **demo payment provider** the active one (no NOWPayments keys needed),
  so checkout sends buyers to the internal `/buy/demo-pay` page; and
- enables **`POST /api/demo/pay`**, which mints a license without payment.

> ⚠️ `DEMO_MODE` gives Pro away for free. Never set it on a real store.

The license the demo mints is signed with the **dev Ed25519 key whose public half is
already embedded in the shipped app** (`LICENSE_PUBKEY_B64` in
`cleanmic/src-tauri/src/license.rs`). So the app verifies these tokens offline with
**no app rebuild required** for licensing — only the site URL changed in the app.

---

## 1. Deploy the website to Netlify

### a. Database (Supabase Postgres)

The order/license flow needs Postgres. Use **Supabase** (free tier is plenty):

1. Create a project at https://supabase.com (note the DB password).
2. Open **SQL Editor** → paste all of [`supabase/schema.sql`](supabase/schema.sql)
   → **Run**. That creates the 4 tables + indexes + FKs and locks them down with
   RLS. (It's idempotent — safe to re-run.)
3. Grab the **Transaction pooler** connection string (Project Settings → Database
   → Connection string), port **6543**, for `DATABASE_URL`. Full walkthrough:
   [`supabase/README.md`](supabase/README.md).

The website and the desktop app share this **one** database: the app never connects
to Postgres directly — it only calls the website's `/api`, which is the sole DB client.

> Prefer `drizzle-kit` over the SQL editor? Run migrations against the **direct**
> connection (port 5432), not the 6543 pooler:
> `DIRECT_DATABASE_URL="postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres?sslmode=require" npm run db:migrate`

### b. Environment variables (Netlify → Site settings → Environment variables)

These are **runtime** vars and must be set in the Netlify UI (or `netlify env:set`),
not only in `netlify.toml`:

| Key | Value |
|---|---|
| `DEMO_MODE` | `true` |
| `LICENSE_SIGNING_KEY_JWK` | the dev key (single line, below) |
| `DATABASE_URL` | your Supabase **transaction pooler** string (port 6543) |

The dev signing key (matches the app's embedded public key — use as-is for the demo):

```json
{"kty":"OKP","crv":"Ed25519","x":"YjICy5hhlXqxHsT7pZoe3AXUPqghplWYP48GPOG4YOI","d":"f0WscM8gsx9LHWMR9p6u3GPwtVJZXJAWDRrHBLvnhA8"}
```

Optional: `ADMIN_TOKEN` (admin dashboard), `RESEND_API_KEY` + `EMAIL_FROM`
(email the key), `UPSTASH_REDIS_REST_URL` + `_TOKEN` (rate limiting). All optional
for the demo.

### c. Deploy

Push the repo / connect it to Netlify. `netlify.toml` already declares the
`@netlify/plugin-nextjs` runtime and the build command. Set the site name so it
resolves to `soundnt-app.vercel.app`.

### d. Verify

Open `https://soundnt-app.vercel.app/api/health` — you should see:

```json
{ "ok": true, "demoMode": true, "config": { "database": true, "signingKey": true, … } }
```

---

## 2. Point the app at the demo site

The app now defaults to `https://soundnt-app.vercel.app` (changed in
`src-tauri/src/license.rs` and `src-tauri/src/cloud.rs`). Rebuild it so the new
default ships:

```powershell
cd cleanmic
npm install
./scripts/fetch-models.ps1   # one-time, if not already done
npm run tauri build          # or: npm run tauri dev   (for quick testing)
```

**Testing against a local website instead of the live site** (no rebuild of the
constants needed — these env vars override at runtime):

```powershell
$env:CLEANMIC_CHECKOUT_URL = "http://localhost:3000/buy"
$env:CLEANMIC_API_BASE     = "http://localhost:3000/api"
npm run tauri dev
```

(Keep both on the **same origin**.)

---

## 3. Try the flow

### Fastest: one-command smoke test (no desktop build, no browser)

With the site running and pointed at Supabase (`.env.local` already has
`DEMO_MODE=true` + the dev key — just paste your Supabase `DATABASE_URL`):

```bash
cd soundntwebsite
npm install          # first time only
npm run dev          # leave running → http://localhost:3000
```

then, in a second terminal:

```bash
cd soundntwebsite
npm run demo:smoke               # defaults to pro_12m on http://localhost:3000
# or pick a plan / a deployed site:
npm run demo:smoke -- --plan pro_1m
BASE_URL=https://soundnt-app.vercel.app npm run demo:smoke
```

It runs the **real** pipeline — `checkout → demo/pay (simulated crypto) → order
poll → offline Ed25519 verify** — and prints the minted Pro license, proving the
token is one the desktop app accepts offline. A green `✓ PASS` means the whole
Supabase-backed crypto→Pro flow works end to end.

### Full experience: through the desktop app

1. In the app, open the Pro paywall and click a plan's **Buy**.
2. The browser opens the demo checkout → click **Simulate payment & unlock**.
3. The success page shows the license key, and the app unlocks Pro **on its own**
   within a few seconds (it's polling `GET /api/order/:ref`).
4. Manual fallback: copy the key from the success page and paste it into the app
   (Settings → Activate license).

---

## Going from demo → real later

1. `npm run keygen` → new keypair. Put the **private JWK** in
   `LICENSE_SIGNING_KEY_JWK`; paste the **public x** into
   `cleanmic/src-tauri/src/license.rs` (`LICENSE_PUBKEY_B64`) and ship a new app build.
2. Set `DEMO_MODE=false` (or unset). Configure `NOWPAYMENTS_API_KEY` +
   `NOWPAYMENTS_IPN_SECRET` and point the NOWPayments IPN callback at
   `https://soundnt-app.vercel.app/api/webhooks/nowpayments`.
3. Everything else (checkout, polling, activation, revocation) is unchanged.
