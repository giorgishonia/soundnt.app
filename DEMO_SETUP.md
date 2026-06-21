# Demo setup — crypto payment without real money

This wires the **website** (`soundntwebsite`, deployed at `https://soundnt.netlify.app`)
and the **desktop app** (`cleanmic`) so the full crypto-checkout flow works **as a
demo**: nobody spends crypto, but the app still unlocks Pro automatically with a
real, signed license.

## How the demo works

```
app "Buy"  ──▶  browser: soundnt.netlify.app/buy?plan&ref&device&v
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

### a. Database (Postgres)

The order/license flow needs Postgres. Easiest: add Netlify's **Neon** database
integration to the site (Netlify dashboard → **Add database** → Neon). It injects
`NETLIFY_DATABASE_URL`, which the app reads automatically.

Or create a free DB at https://neon.tech and copy its connection string.

Then apply the schema (from your machine, once):

```bash
cd soundntwebsite
# use the same connection string Netlify/Neon gave you:
DATABASE_URL="postgres://…neon…?sslmode=require" npm run db:migrate
```

### b. Environment variables (Netlify → Site settings → Environment variables)

These are **runtime** vars and must be set in the Netlify UI (or `netlify env:set`),
not only in `netlify.toml`:

| Key | Value |
|---|---|
| `DEMO_MODE` | `true` |
| `LICENSE_SIGNING_KEY_JWK` | the dev key (single line, below) |
| `DATABASE_URL` | your Neon string — *skip if using the Netlify Neon integration* |

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
resolves to `soundnt.netlify.app`.

### d. Verify

Open `https://soundnt.netlify.app/api/health` — you should see:

```json
{ "ok": true, "demoMode": true, "config": { "database": true, "signingKey": true, … } }
```

---

## 2. Point the app at the demo site

The app now defaults to `https://soundnt.netlify.app` (changed in
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
   `https://soundnt.netlify.app/api/webhooks/nowpayments`.
3. Everything else (checkout, polling, activation, revocation) is unchanged.
