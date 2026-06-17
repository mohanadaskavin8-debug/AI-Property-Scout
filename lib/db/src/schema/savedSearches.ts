import {
  pgTable,
  serial,
  jsonb,
  timestamp,
  text,
  integer,
  boolean,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const savedSearchesTable = pgTable(
  "saved_searches",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name"),
    query: text("query").notNull(),
    queryNormalized: text("query_normalized").notNull(),
    parsedFilters: jsonb("parsed_filters"),
    alertEnabled: boolean("alert_enabled").notNull().default(false),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastResultCount: integer("last_result_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("saved_search_user_query_uq").on(t.userId, t.queryNormalized),
    index("saved_search_user_updated_idx").on(t.userId, t.updatedAt),
  ],
);

// userId is derived from the authenticated session, never from the request body.
export const insertSavedSearchSchema = createInsertSchema(savedSearchesTable).omit({
  id: true,
  userId: true,
  queryNormalized: true,
  lastRunAt: true,
  lastResultCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSavedSearch = z.infer<typeof insertSavedSearchSchema>;
export type SavedSearch = typeof savedSearchesTable.$inferSelect;
