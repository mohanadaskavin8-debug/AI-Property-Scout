import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const searchesTable = pgTable("searches", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  location: text("location"),
  count: integer("count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSearchSchema = createInsertSchema(searchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSearch = z.infer<typeof insertSearchSchema>;
export type Search = typeof searchesTable.$inferSelect;
