import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const pagesTable = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull().default("page"),
    title: text("title").notNull(),
    emoji: text("emoji"),
    parentId: integer("parent_id"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("pages_parent_idx").on(table.parentId)],
);

export type Page = typeof pagesTable.$inferSelect;
export type InsertPage = typeof pagesTable.$inferInsert;
