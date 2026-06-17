import {
  pgTable,
  serial,
  jsonb,
  timestamp,
  text,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const visitedPropertiesTable = pgTable(
  "visited_properties",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    propertyId: text("property_id").notNull(),
    propertyData: jsonb("property_data").notNull(),
    visitCount: integer("visit_count").notNull().default(1),
    firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }).notNull().defaultNow(),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("visited_user_property_uq").on(t.userId, t.propertyId),
    index("visited_user_last_idx").on(t.userId, t.lastVisitedAt),
  ],
);

// userId is derived from the authenticated session, never from the request body.
export const insertVisitedPropertySchema = createInsertSchema(visitedPropertiesTable).omit({
  id: true,
  userId: true,
  visitCount: true,
  firstVisitedAt: true,
  lastVisitedAt: true,
});
export type InsertVisitedProperty = z.infer<typeof insertVisitedPropertySchema>;
export type VisitedProperty = typeof visitedPropertiesTable.$inferSelect;
