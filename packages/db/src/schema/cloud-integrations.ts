import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

// Cloud storage integrations (Google Drive, Dropbox, etc.)
export const cloudIntegrationsTable = pgTable("cloud_integrations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id).notNull(),
  provider: text("provider").notNull(), // 'google_drive', 'dropbox', 'one_drive'
  
  // OAuth tokens (encrypted at rest in production)
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  
  // User info from provider
  providerAccountEmail: text("provider_account_email"),
  providerAccountId: text("provider_account_id"),
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncError: text("sync_error"),
  
  // Optional sync settings
  syncSettings: jsonb("sync_settings").default({}),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Queue for cloud file imports
export const cloudImportQueueTable = pgTable("cloud_import_queue", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id).notNull(),
  integrationId: integer("integration_id").references(() => cloudIntegrationsTable.id, { onDelete: "cascade" }).notNull(),
  
  // File info from cloud provider
  providerFileId: text("provider_file_id").notNull(),
  providerFileName: text("provider_file_name").notNull(),
  providerFilePath: text("provider_file_path"),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  indexOnly: boolean("index_only").notNull().default(false),
  
  // Import status
  status: text("status").notNull().default("pending"), // 'pending', 'downloading', 'processing', 'completed', 'failed'
  errorMessage: text("error_message"),
  
  // Result
  sourceId: integer("source_id"), // References sources table after import
  
  // Target folder in Eden
  targetPageId: integer("target_page_id"), // Folder to import into
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CloudIntegration = typeof cloudIntegrationsTable.$inferSelect;
export type InsertCloudIntegration = typeof cloudIntegrationsTable.$inferInsert;
export type CloudImportQueue = typeof cloudImportQueueTable.$inferSelect;
export type InsertCloudImportQueue = typeof cloudImportQueueTable.$inferInsert;
