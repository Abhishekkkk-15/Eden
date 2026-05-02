import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const agentsTable = pgTable("agents", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  emoji: text("emoji").notNull().default(""),
  prompt: text("prompt").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Agent = typeof agentsTable.$inferSelect;
export type InsertAgent = typeof agentsTable.$inferInsert;
