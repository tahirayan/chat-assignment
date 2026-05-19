import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const NOW_MS = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // UUIDv7
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull().default(""),
  avatarUrl: text("avatar_url"), // data URL acceptable for demo
  locale: text("locale").notNull().default("en"), // 'en' | 'tr' | 'et'
  isPro: integer("is_pro", { mode: "boolean" }).notNull().default(false),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(NOW_MS),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    recipientId: text("recipient_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(NOW_MS),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("messages_conversation_idx").on(
      t.senderId,
      t.recipientId,
      t.createdAt
    ),
  ]
);

export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey(), // jti
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(), // SHA-256 of the token
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(NOW_MS),
});

/**
 * Web Push subscriptions (Phase 20). One row per (browser × user) —
 * `endpoint` is unique on a per-service basis (FCM URL on Android, etc.)
 * and identifies the subscription, so we upsert on it. Rows are dropped
 * server-side when the push service returns 410 Gone, or by the client
 * on logout / toggle-off via DELETE /api/push/subscribe.
 */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(), // UUIDv7
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  /** Push service URL — Mozilla / FCM / WPS. Uniqueness is per-browser. */
  endpoint: text("endpoint").notNull().unique(),
  /** Client-side P-256 public key (base64url). Needed to encrypt the payload. */
  p256dh: text("p256dh").notNull(),
  /** Client-side auth secret (base64url). */
  auth: text("auth").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(NOW_MS),
});

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  stripePaymentIntent: text("stripe_payment_intent").notNull().unique(),
  amount: integer("amount").notNull(), // cents
  currency: text("currency").notNull().default("eur"),
  status: text("status").notNull(), // 'pending' | 'succeeded' | 'failed'
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(NOW_MS),
});

export type DbUser = typeof users.$inferSelect;
export type DbUserInsert = typeof users.$inferInsert;
export type DbMessage = typeof messages.$inferSelect;
export type DbMessageInsert = typeof messages.$inferInsert;
export type DbRefreshToken = typeof refreshTokens.$inferSelect;
export type DbRefreshTokenInsert = typeof refreshTokens.$inferInsert;
export type DbPayment = typeof payments.$inferSelect;
export type DbPaymentInsert = typeof payments.$inferInsert;
export type DbPushSubscription = typeof pushSubscriptions.$inferSelect;
export type DbPushSubscriptionInsert = typeof pushSubscriptions.$inferInsert;
