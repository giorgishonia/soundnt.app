# Go-live runbook — switch from demo to real crypto

This takes **soundn't** from the working demo (no real money) to a live store that
accepts **real crypto** via NOWPayments and mints Pro licenses buyers can trust.

Live site: **https://soundnt-app.vercel.app** (Vercel) · DB: **Supabase** ·
App: **cleanmic** (offline license verification).

---

## 🔑 The golden rule (read this first)

**Ship the new app build with the new key BEFORE you turn on real crypto.**

The desktop app verifies every license **offline** against the public key baked
into it (`LICENSE_PUBKEY_B64` in `cleanmic/src-tauri/src/license.rs`). If the
server starts signing with a new key while buyers still run the old build, their
app rejects the license — **they pay and stay locked out.**

So the order is always: **new key → new app build shipped → then flip the server.**

> **Rotation is mandatory.** The current *demo* signing key's private half is
> published in this repo (`DEMO_SETUP.md`, tests) and embedded in the shipped demo
> app, so anyone could forge Pro licenses. A real store needs a fresh, secret key.

---

## Phase 1 — Generate the production signing key

Run this **yourself** on a trusted machine (keep the private key out of chats/logs):

```bash
cd soundntwebsite
npm run keygen
```

It prints a **public x** and a **private JWK**: `{"kty":"OKP","crv":"Ed25519","x":"…","d":"…"}`.

- 🔒 **Private JWK** → goes ONLY into the Vercel env var `LICENSE_SIGNING_KEY_JWK`
  (Phase 5). Never commit it, never paste it anywhere public. Anyone with it can
  mint unlimited Pro.
- ✅ **Public x** → safe to share. It goes into the app (Phase 2).

## Phase 2 — Build & ship the app with the new key

1. Edit `cleanmic/src-tauri/src/license.rs` → set `LICENSE_PUBKEY_B64` to the new
   **public x**.
2. Build & distribute the installer as **the** download / push it via the updater:
   ```powershell
   cd cleanmic
   npm run tauri build
   ```
3. Confirm the **updater** signing key (`tauri.conf.json`) is the real production
   keypair — it's separate from the license key. A leaked updater key lets an
   attacker push a malicious "update" to every install.

> The app's default endpoints already point at `https://soundnt-app.vercel.app`
> (`cloud.rs` API base, `license.rs` checkout URL) — no change needed unless you
> move to a custom domain, in which case update both and rebuild.

## Phase 3 — NOWPayments (real crypto)

1. Create an account at https://nowpayments.io.
2. Get the **API key** and generate an **IPN secret**.
3. Set the **IPN callback URL** in their dashboard to:
   ```
   https://soundnt-app.vercel.app/api/webhooks/nowpayments
   ```

The webhook (`app/api/webhooks/nowpayments/route.ts`) verifies the IPN with
HMAC-SHA512 (constant-time) before minting, and minting is idempotent + has
price-match and underpayment guards.

## Phase 4 — Recommended hardening before public traffic

- **Upstash Redis** (rate limiting): create a free DB → set
  `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Without it, rate limiting
  **fails open** — checkout is unthrottled against the paid NOWPayments invoice API.
- **Resend domain**: verify `soundnt.app` (DNS: SPF/DKIM/DMARC) so real buyers
  receive their key, then set `EMAIL_FROM` to a sender on it (e.g.
  `soundn't <pro@soundnt.app>`). Until verified, `onboarding@resend.dev` only
  delivers to the Resend account owner.
- **Optional code hardening:** make the webhook refuse to mint when a "paid" IPN
  omits the amount fields (currently it mints without an amount check in that edge
  case — see `lib/services/issue.ts` paid branch). This is a behavior change, so
  decide deliberately.

## Phase 5 — Flip the server (Vercel env) + redeploy

In **Vercel → Settings → Environment Variables** (Production), set:

| Key | Value |
|---|---|
| `LICENSE_SIGNING_KEY_JWK` | the **new private JWK** from Phase 1 |
| `DEMO_MODE` | `false` (or delete it) |
| `NOWPAYMENTS_API_KEY` | from Phase 3 |
| `NOWPAYMENTS_IPN_SECRET` | from Phase 3 |
| `EMAIL_FROM` | your verified-domain sender |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | from Phase 4 |
| `ALLOW_TEST_MODE` | leave unset / `false` |
| `DATABASE_URL`, `ADMIN_PATH`, `ADMIN_TOKEN` | unchanged (already set) |

Then **Redeploy** (env changes and `ADMIN_PATH` only take effect on a fresh build).

> **Safety net:** `env.signingKey()` throws if the shared *dev* key is used while
> `DEMO_MODE` is off — so a misconfigured cutover fails loudly (`/api/health`
> shows `signingKey:false`) instead of silently signing with a forgeable key.

Turning `DEMO_MODE` off also (a) makes NOWPayments the active provider and (b)
404s `POST /api/demo/pay` and `/buy/demo-pay`, closing the free-mint path.

## Phase 6 — Verify for real

1. `GET https://soundnt-app.vercel.app/api/health` should show:
   ```json
   { "demoMode": false,
     "config": { "database": true, "signingKey": true, "nowpayments": true,
                 "resend": true, "admin": true, "rateLimiting": true } }
   ```
2. Make **one real small-amount purchase** through the freshly-built app (or `/buy`):
   pay crypto → the IPN mints → the app auto-unlocks within seconds (it polls
   `GET /api/order/:ref`) → the license verifies offline against the new embedded key.
3. Check `/ops-panel` (your `ADMIN_PATH` slug) shows the order + activation, and the
   buyer's email arrived.

---

## Rollback / if something goes wrong

- **Buyer paid, app won't unlock:** the app build doesn't have the matching public
  key. Re-check Phase 2 (the embedded `LICENSE_PUBKEY_B64` must equal the public x
  of the `LICENSE_SIGNING_KEY_JWK` in Vercel). The buyer can paste the key manually
  (Settings → Activate license) or recover it via `/account`.
- **`/api/health` `nowpayments:false`:** both `NOWPAYMENTS_API_KEY` and
  `NOWPAYMENTS_IPN_SECRET` must be set; redeploy after setting them.
- **`signingKey:false`:** the dev-key guard tripped (dev key + `DEMO_MODE` off) or
  the JWK is malformed/multiline. Set the new private JWK as a single line.
- **Revoke a bad license:** `/ops-panel` → revoke; the app self-locks on its next
  `/api/validate` check (signature-verified revocation only — a plaintext status
  can never lock anyone out).
- **Emergency:** set `DEMO_MODE=true` to fall back to the demo (stops taking real
  crypto). The app keeps working offline regardless of server state.

---

## Pre-launch checklist

- [ ] Phase 1: production keypair generated; private JWK stored securely
- [ ] Phase 2: `LICENSE_PUBKEY_B64` updated; **new app build shipped/distributed**
- [ ] Phase 2: updater signing key is production-real
- [ ] Phase 3: NOWPayments API key + IPN secret; callback URL set
- [ ] Phase 4: Upstash configured; Resend domain verified + `EMAIL_FROM` updated
- [ ] Phase 5: Vercel env set (`DEMO_MODE=false`, new JWK, NOWPayments, Upstash); redeployed
- [ ] Phase 6: `/api/health` all green; one real test purchase end-to-end
- [ ] Supabase tables clean of demo data
- [ ] Pricing in `lib/plans.ts` matches what you intend to charge
