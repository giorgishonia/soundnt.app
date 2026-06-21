/**
 * lib/db/schema.ts — Drizzle / Postgres schema (spec §4).
 *
 * Four tables: orders, licenses, activations, webhook_events. License id is the
 * human key (`SNDT-…`); `ref` is the bearer capability for order polling.
 */

import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  inet,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// --- licenses: one per issued token --------------------------------------
export const licenses = pgTable(
  "licenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lic: text("lic").notNull(), // 'SNDT-XXXXX-XXXXX'
    plan: text("plan").notNull(),
    termMonths: integer("term_months").notNull(),
    days: integer("days").notNull(),
    email: text("email"),
    token: text("token").notNull(), // the signed token (stored for re-delivery)
    iat: bigint("iat", { mode: "number" }).notNull(),
    exp: bigint("exp", { mode: "number" }).notNull(),
    status: text("status").notNull().default("active"), // active|revoked|refunded
    orderRef: text("order_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
  },
  (t) => ({
    licUnique: uniqueIndex("licenses_lic_unique").on(t.lic),
    emailIdx: index("licenses_email_idx").on(t.email),
    orderRefIdx: index("licenses_order_ref_idx").on(t.orderRef),
  })
);

// --- orders: one per checkout attempt, keyed by the app-supplied ref ------
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ref: text("ref").notNull(), // 128-bit order ref from the app
    plan: text("plan").notNull(),
    amountCents: integer("amount_cents").notNull(), // server-derived from plan
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("pending"), // pending|paid|expired|failed
    provider: text("provider").notNull(),
    providerInvoiceId: text("provider_invoice_id"),
    providerInvoiceUrl: text("provider_invoice_url"), // stored for idempotent re-checkout
    deviceId: text("device_id"),
    email: text("email"),
    appVersion: text("app_version"),
    licenseId: uuid("license_id").references(() => licenses.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // pending-order TTL
  },
  (t) => ({
    refUnique: uniqueIndex("orders_ref_unique").on(t.ref),
    statusIdx: index("orders_status_idx").on(t.status),
    createdIdx: index("orders_created_idx").on(t.createdAt),
  })
);

// --- activations: device bindings reported by the app --------------------
export const activations = pgTable(
  "activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    licenseId: uuid("license_id")
      .notNull()
      .references(() => licenses.id),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name"),
    appVersion: text("app_version"),
    ip: inet("ip"),
    fingerprint: text("fingerprint"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    count: integer("count").notNull().default(1),
  },
  (t) => ({
    licDeviceUnique: uniqueIndex("activations_license_device_unique").on(
      t.licenseId,
      t.deviceId
    ),
  })
);

// --- webhook_events: idempotency log -------------------------------------
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(), // provider's event/payment id
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processed: boolean("processed").notNull().default(false),
  },
  (t) => ({
    providerEventUnique: uniqueIndex("webhook_events_provider_event_unique").on(
      t.provider,
      t.eventId
    ),
  })
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type License = typeof licenses.$inferSelect;
export type NewLicense = typeof licenses.$inferInsert;
export type Activation = typeof activations.$inferSelect;
export type NewActivation = typeof activations.$inferInsert;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
