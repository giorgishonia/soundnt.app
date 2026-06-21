# Supabase setup (single database for the website **and** the app)

The whole licensing system runs on **one** Postgres database. The website is the
only thing that talks to it directly; the desktop app (`cleanmic`) is a pure API
client — it calls the website's `/api`, polls `GET /api/order/:ref`, and verifies
licenses offline. So "website + app on the same database" just means pointing the
website at this one Supabase project.

## 1. Create the project + schema

1. Create a project at https://supabase.com (any region; remember the DB password).
2. Open **SQL Editor** → paste all of [`schema.sql`](./schema.sql) → **Run**.
   - Creates the 4 tables (`orders`, `licenses`, `activations`, `webhook_events`),
     all indexes + FKs, and enables Row Level Security with no policies so the
     public REST API can't read them (the server connection bypasses RLS).
   - It's idempotent — safe to re-run.

## 2. Get the connection string

Supabase → **Project Settings → Database → Connection string**. There are two you'll use:

| Use | Mode | Port | Shape |
|---|---|---|---|
| **App runtime** (`DATABASE_URL`) | **Transaction pooler** | **6543** | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require` |
| **Migrations** (`DIRECT_DATABASE_URL`, optional) | Direct | 5432 | `postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres?sslmode=require` |

- The app (`lib/db/client.ts`, postgres.js with `prepare:false`) **must** use the
  **transaction pooler on port 6543** — it's built for serverless/edge functions.
- `drizzle-kit` migrations **must not** use 6543 (no prepared statements / session
  features there). Either paste `schema.sql` in the SQL editor (recommended) or set
  `DIRECT_DATABASE_URL` to the **direct 5432** string and run `npm run db:migrate`.

## 3. Point the website at it

Set `DATABASE_URL` to the **transaction pooler (6543)** string:

- Local: in `.env.local` (see [`../.env.example`](../.env.example)).
- Netlify: Site settings → Environment variables.

That's it — verify with `GET /api/health` (`config.database` should be `true`).

> The pgBouncer/Supavisor transaction pooler does **not** support prepared
> statements; the client already passes `prepare: false`. If you ever see
> `prepared statement "..." does not exist`, you're on the wrong client config or
> port.
