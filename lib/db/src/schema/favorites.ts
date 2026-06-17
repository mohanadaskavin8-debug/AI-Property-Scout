import { pgTable, serial, jsonb, timestamp, text, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const favoritesTable = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    propertyData: jsonb("property_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("favorites_user_id_idx").on(t.userId)],
);

// userId is derived from the authenticated session, never from the request body.
export const insertFavoriteSchema = createInsertSchema(favoritesTable).omit({
  id: true,
  createdAt: true,
  userId: true,
});
export type InsertFavorite = z.infer<typeof insertFavoriteSchema>;
export type Favorite = typeof favoritesTable.$inferSelect;
