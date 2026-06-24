import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const emailIntegrationsTable = pgTable("email_integrations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id).notNull().unique(),
  
  // Provider: 'resend' or 'smtp'
  provider: text("provider").notNull().default("resend"), 
  
  // Resend configuration
  resendApiKey: text("resend_api_key"),
  
  // SMTP configuration
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpFrom: text("smtp_from"), // Default sender email
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type EmailIntegration = typeof emailIntegrationsTable.$inferSelect;
export type InsertEmailIntegration = typeof emailIntegrationsTable.$inferInsert;
