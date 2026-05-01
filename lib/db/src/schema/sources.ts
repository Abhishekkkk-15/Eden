import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const sourcesTable = pgTable("sources", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  url: text("url"),
  parentPageId: integer("parent_page_id"),
  mediaPath: text("media_path"),
  mediaMimeType: text("media_mime_type"),
  mediaSizeBytes: integer("media_size_bytes"),
  content: text("content").notNull().default(""),
  summary: text("summary"),
  status: text("status").notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const sourceChunksTable = pgTable("source_chunks", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull(),
  position: integer("position").notNull().default(0),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const transcriptionsTable = pgTable("transcriptions", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull().unique(),
  content: text("content").notNull(),
  model: text("model").notNull().default("whisper-1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Source = typeof sourcesTable.$inferSelect;
export type InsertSource = typeof sourcesTable.$inferInsert;
export type SourceChunk = typeof sourceChunksTable.$inferSelect;
export type InsertSourceChunk = typeof sourceChunksTable.$inferInsert;
export type Transcription = typeof transcriptionsTable.$inferSelect;
export type InsertTranscription = typeof transcriptionsTable.$inferInsert;
