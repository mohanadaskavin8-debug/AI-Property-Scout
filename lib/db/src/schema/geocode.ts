import { pgTable, text, doublePrecision, integer, timestamp, index } from "drizzle-orm/pg-core";

// Persistent geocode cache so we never re-hit Nominatim for an address we've
// already resolved (or already failed). Keyed by a normalized address string.
// We only persist TERMINAL states ("ok" | "failed"); "pending" is a transient
// runtime state owned by the in-process queue and is never stored here.
export const geocodeCacheTable = pgTable(
  "geocode_cache",
  {
    addressKey: text("address_key").primaryKey(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: text("status").notNull(), // "ok" | "failed"
    source: text("source").notNull().default("nominatim"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    // Failures get a retry backoff; until nextRetryAt passes we treat the
    // cached "failed" as authoritative to avoid retry storms.
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("geocode_cache_status_idx").on(t.status)],
);

export type GeocodeCacheRow = typeof geocodeCacheTable.$inferSelect;
