import { pgTable, serial, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

// Workflow automation: triggers + actions
export const workflowsTable = pgTable("workflows", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  emoji: text("emoji").notNull().default("🤖"),
  
  // Trigger configuration
  triggerType: text("trigger_type").notNull(), // 'source_created', 'source_updated', 'scheduled', 'manual'
  triggerConfig: jsonb("trigger_config").notNull().default({}), // { sourceKind: 'image', folderId: 123, etc }
  
  // Action configuration (array of actions to run)
  actions: jsonb("actions").notNull().default([]), // [{ type: 'tag', config: { tags: ['receipt'] } }, ...]
  
  // Status
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  runCount: integer("run_count").notNull().default(0),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Workflow execution logs
export const workflowRunsTable = pgTable("workflow_runs", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id").notNull(),
  
  // What triggered this run
  triggerSourceId: integer("trigger_source_id"), // Source that triggered it (if applicable)
  triggerData: jsonb("trigger_data").notNull().default({}),
  
  // Execution status
  status: text("status").notNull().default("running"), // 'running', 'completed', 'failed', 'cancelled'
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  
  // Results for each action
  actionResults: jsonb("action_results").notNull().default([]), // [{ actionIndex: 0, status: 'success', output: {} }, ...]
  
  // Error info if failed
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Background jobs queue (for async processing)
export const jobQueueTable = pgTable("job_queue", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id),
  
  // Job details
  jobType: text("job_type").notNull(), // 'transcribe', 'analyze_video', 'generate_summary', etc
  entityType: text("entity_type").notNull(), // 'source', 'page', etc
  entityId: integer("entity_id").notNull(),
  
  // Job data
  payload: jsonb("payload").notNull().default({}),
  
  // Status tracking
  status: text("status").notNull().default("pending"), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  priority: integer("priority").notNull().default(0), // Higher = process first
  
  // Progress
  progress: integer("progress").notNull().default(0), // 0-100
  progressMessage: text("progress_message"),
  
  // Timing
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  
  // Error handling
  retryCount: integer("retry_count").notNull().default(0),
  maxRetries: integer("max_retries").notNull().default(3),
  errorMessage: text("error_message"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Source tags table (for workflow tag action and manual tagging)
export const sourceTagsTable = pgTable("source_tags", {
  id: serial("id").primaryKey(),
  sourceId: integer("source_id").notNull(),
  tag: text("tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Workflow = typeof workflowsTable.$inferSelect;
export type InsertWorkflow = typeof workflowsTable.$inferInsert;
export type WorkflowRun = typeof workflowRunsTable.$inferSelect;
export type InsertWorkflowRun = typeof workflowRunsTable.$inferInsert;
export type JobQueue = typeof jobQueueTable.$inferSelect;
export type InsertJobQueue = typeof jobQueueTable.$inferInsert;
export type SourceTag = typeof sourceTagsTable.$inferSelect;
export type InsertSourceTag = typeof sourceTagsTable.$inferInsert;

// Action types for workflows
export type WorkflowAction = 
  | { type: "tag"; config: { tags: string[]; replaceExisting?: boolean } }
  | { type: "move_to_folder"; config: { folderId: number } }
  | { type: "summarize"; config: { maxLength?: number } }
  | { type: "transcribe"; config: { language?: string } }
  | { type: "extract_entities"; config: { entityTypes?: string[] } }
  | { type: "send_notification"; config: { message: string; notifyType: "toast" | "email" } }
  | { type: "webhook"; config: { url: string; method: "GET" | "POST"; headers?: Record<string, string> } }
  | { type: "ai_transform"; config: { prompt: string; outputField: "title" | "description" | "tags" } };

// Trigger config types
export type WorkflowTrigger =
  | { type: "source_created"; config: { sourceKind?: string[]; folderId?: number; anyFolder?: boolean } }
  | { type: "source_updated"; config: { fields?: string[] } }
  | { type: "scheduled"; config: { cron: string; timezone?: string } }
  | { type: "manual"; config: {} };
