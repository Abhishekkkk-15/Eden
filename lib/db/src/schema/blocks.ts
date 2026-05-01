import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const blocksTable = pgTable(
  "blocks",
  {
    id: serial("id").primaryKey(),
    pageId: integer("page_id").notNull(),
    type: text("type").notNull().default("text"),
    content: text("content").notNull().default(""),
    checked: boolean("checked").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("blocks_page_idx").on(table.pageId)],
);

export type Block = typeof blocksTable.$inferSelect;
export type InsertBlock = typeof blocksTable.$inferInsert;
