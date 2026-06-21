-- =============================================================================
-- soundnt.app — Supabase schema (orders, licenses, activations, webhook_events)
--
-- This is the canonical end-state schema, matching lib/db/schema.ts and the
-- Drizzle migrations (0000_init.sql + 0001_far_vertigo.sql) column-for-column —
-- including the `fingerprint` column on activations added by migration 0001.
--
-- HOW TO USE: open your Supabase project → SQL Editor → paste this whole file →
-- Run. It is idempotent (CREATE ... IF NOT EXISTS, guarded FKs), so re-running it
-- is safe and a no-op after the first run.
--
-- SECURITY: every table is in the `public` schema, which Supabase auto-exposes
-- through PostgREST to the anon/authenticated API roles. We ENABLE ROW LEVEL
-- SECURITY with NO policies on all four tables, which denies all access via the
-- API key, while the website's server connection (the `postgres` role, which
-- owns these tables and is not FORCE'd) bypasses RLS and works normally. These
-- tables hold signed license tokens, emails, IPs and webhook payloads — they
-- must never be readable through the public REST API.
-- =============================================================================

-- gen_random_uuid() is built into Postgres core since v13 (Supabase runs PG15+),
-- so no extension is strictly required. pgcrypto is pre-installed on Supabase;
-- this line is a harmless safety net.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "licenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lic" text NOT NULL,
	"plan" text NOT NULL,
	"term_months" integer NOT NULL,
	"days" integer NOT NULL,
	"email" text,
	"token" text NOT NULL,
	"iat" bigint NOT NULL,
	"exp" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"order_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"plan" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text NOT NULL,
	"provider_invoice_id" text,
	"provider_invoice_url" text,
	"device_id" text,
	"email" text,
	"app_version" text,
	"license_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"license_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"device_name" text,
	"app_version" text,
	"ip" "inet",
	"fingerprint" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);

-- Self-heal: if an older `activations` table already exists without it, add the
-- fingerprint column (matches migration 0001_far_vertigo.sql).
ALTER TABLE "activations" ADD COLUMN IF NOT EXISTS "fingerprint" text;

CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL
);

-- ---------------------------------------------------------------------------
-- Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS, so guard by name).
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activations_license_id_licenses_id_fk') THEN
		ALTER TABLE "activations" ADD CONSTRAINT "activations_license_id_licenses_id_fk"
			FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE no action ON UPDATE no action;
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_license_id_licenses_id_fk') THEN
		ALTER TABLE "orders" ADD CONSTRAINT "orders_license_id_licenses_id_fk"
			FOREIGN KEY ("license_id") REFERENCES "public"."licenses"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $do$;

-- ---------------------------------------------------------------------------
-- Indexes (all USING btree, matching the Drizzle migrations exactly)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "activations_license_device_unique" ON "activations" USING btree ("license_id","device_id");
CREATE UNIQUE INDEX IF NOT EXISTS "licenses_lic_unique" ON "licenses" USING btree ("lic");
CREATE INDEX IF NOT EXISTS "licenses_email_idx" ON "licenses" USING btree ("email");
CREATE INDEX IF NOT EXISTS "licenses_order_ref_idx" ON "licenses" USING btree ("order_ref");
CREATE UNIQUE INDEX IF NOT EXISTS "orders_ref_unique" ON "orders" USING btree ("ref");
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");
CREATE INDEX IF NOT EXISTS "orders_created_idx" ON "orders" USING btree ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_unique" ON "webhook_events" USING btree ("provider","event_id");

-- ---------------------------------------------------------------------------
-- Row Level Security: enable with NO policies on all four tables (see header).
-- ENABLE ROW LEVEL SECURITY is idempotent (no-op if already enabled). Do NOT add
-- FORCE ROW LEVEL SECURITY — that would subject the table owner (the server's
-- postgres role) to RLS and break every server query.
-- ---------------------------------------------------------------------------
ALTER TABLE "licenses"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activations"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Optional sanity checks (run separately after the above):
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('orders','licenses','activations','webhook_events');
--     -- all four should show relrowsecurity = true
--   SELECT conname FROM pg_constraint
--     WHERE conname IN ('activations_license_id_licenses_id_fk','orders_license_id_licenses_id_fk');
-- ---------------------------------------------------------------------------
