import { Router, type IRouter } from "express";
import { db, workflowsTable, workflowRunsTable, jobQueueTable, sourcesTable, sourceTagsTable, pagesTable, agentsTable, emailIntegrationsTable, usersTable } from "@workspace/db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import nodemailer from "nodemailer";
import { Resend } from "resend";

const router: IRouter = Router();

// Validation schemas - more lenient for UI compatibility
const WorkflowActionSchema = z.object({
  type: z.enum(["tag", "generate_tags", "move_to_folder", "ai_organize", "summarize", "transcribe", "extract_entities", "send_notification", "webhook", "ai_transform", "ai_agent_process"]),
  config: z.record(z.unknown()).default({}),
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  emoji: z.string().default("🤖"),
  triggerType: z.enum(["source_created", "source_updated", "scheduled", "manual"]),
  triggerConfig: z.record(z.unknown()).default({}),
  actions: z.array(WorkflowActionSchema),
  isActive: z.boolean().default(true),
});

// GET /workflows - List all workflows for user
router.get("/workflows", async (req, res) => {
  const user = (req as any).user;

  try {
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(eq(workflowsTable.userId, user.id))
      .orderBy(desc(workflowsTable.createdAt));

    res.json(workflows);
  } catch (error) {
    console.error("Failed to fetch workflows:", error);
    res.status(500).json({ error: "Failed to fetch workflows" });
  }
});

// POST /workflows - Create new workflow
router.post("/workflows", async (req, res) => {
  const user = (req as any).user;

  try {
    const data = CreateWorkflowSchema.parse(req.body);

    const [workflow] = await db
      .insert(workflowsTable)
      .values({
        userId: user.id,
        ...data,
        runCount: 0,
      })
      .returning();

    res.status(201).json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("[Workflow] Validation error:", error.errors);
      res.status(400).json({ error: "Invalid workflow data", details: error.errors });
    } else {
      console.error("Failed to create workflow:", error);
      res.status(500).json({ error: "Failed to create workflow" });
    }
  }
});

// GET /workflows/:id - Get single workflow
router.get("/workflows/:id", async (req, res) => {
  const user = (req as any).user;
  const workflowId = parseInt(req.params.id);

  if (isNaN(workflowId)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const [workflow] = await db
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, user.id)));

    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    res.json(workflow);
  } catch (error) {
    console.error("Failed to fetch workflow:", error);
    res.status(500).json({ error: "Failed to fetch workflow" });
  }
});

// PUT /workflows/:id - Update workflow
router.put("/workflows/:id", async (req, res) => {
  const user = (req as any).user;
  const workflowId = parseInt(req.params.id);

  if (isNaN(workflowId)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const data = CreateWorkflowSchema.partial().parse(req.body);

    const [workflow] = await db
      .update(workflowsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, user.id)))
      .returning();

    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    res.json(workflow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid workflow data", details: error.errors });
    } else {
      console.error("Failed to update workflow:", error);
      res.status(500).json({ error: "Failed to update workflow" });
    }
  }
});

// DELETE /workflows/:id - Delete workflow
router.delete("/workflows/:id", async (req, res) => {
  const user = (req as any).user;
  const workflowId = parseInt(req.params.id);

  if (isNaN(workflowId)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const [workflow] = await db
      .delete(workflowsTable)
      .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, user.id)))
      .returning();

    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete workflow:", error);
    res.status(500).json({ error: "Failed to delete workflow" });
  }
});

// POST /workflows/:id/run - Manually trigger workflow
router.post("/workflows/:id/run", async (req, res) => {
  const user = (req as any).user;
  const workflowId = parseInt(req.params.id);

  if (isNaN(workflowId)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const [workflow] = await db
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, user.id)));

    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    // Get optional sourceId from request body for manual runs
    const { sourceId } = req.body as { sourceId?: number };

    // Create a workflow run
    const [run] = await db
      .insert(workflowRunsTable)
      .values({
        workflowId,
        triggerSourceId: sourceId || null,
        triggerData: req.body || {},
        status: "running",
        actionResults: [],
      })
      .returning();

    // Inject sourceId into actions if provided
    let workflowToExecute = workflow;
    if (sourceId) {
      const actions = workflow.actions as Array<{ type: string; config: Record<string, unknown> }>;
      const actionsWithSource = actions.map((a) => ({
        ...a,
        config: { ...a.config, sourceId },
      }));
      workflowToExecute = { ...workflow, actions: actionsWithSource };
    }

    // Execute workflow asynchronously
    executeWorkflow(workflowToExecute, run.id, user.id);

    res.json({ runId: run.id, status: "running" });
  } catch (error) {
    console.error("Failed to run workflow:", error);
    res.status(500).json({ error: "Failed to run workflow" });
  }
});

// GET /workflows/:id/runs - Get workflow run history
router.get("/workflows/:id/runs", async (req, res) => {
  const user = (req as any).user;
  const workflowId = parseInt(req.params.id);

  if (isNaN(workflowId)) {
    res.status(400).json({ error: "Invalid workflow ID" });
    return;
  }

  try {
    const runs = await db
      .select()
      .from(workflowRunsTable)
      .where(eq(workflowRunsTable.workflowId, workflowId))
      .orderBy(desc(workflowRunsTable.createdAt))
      .limit(50);

    res.json(runs);
  } catch (error) {
    console.error("Failed to fetch workflow runs:", error);
    res.status(500).json({ error: "Failed to fetch workflow runs" });
  }
});

// GET /jobs - Get job queue for user
router.get("/jobs", async (req, res) => {
  const user = (req as any).user;

  try {
    const jobs = await db
      .select()
      .from(jobQueueTable)
      .where(eq(jobQueueTable.userId, user.id))
      .orderBy(asc(jobQueueTable.scheduledAt))
      .limit(100);

    res.json(jobs);
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

// POST /jobs/:id/cancel - Cancel a job
router.post("/jobs/:id/cancel", async (req, res) => {
  const user = (req as any).user;
  const jobId = parseInt(req.params.id);

  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  try {
    const [job] = await db
      .update(jobQueueTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(jobQueueTable.id, jobId), eq(jobQueueTable.userId, user.id)))
      .returning();

    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    res.json(job);
  } catch (error) {
    console.error("Failed to cancel job:", error);
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

// DELETE /jobs/clear - Clear all terminal jobs (completed, failed, cancelled)
router.delete("/jobs/clear", async (req, res) => {
  const user = (req as any).user;

  try {
    const deleted = await db
      .delete(jobQueueTable)
      .where(
        and(
          eq(jobQueueTable.userId, user.id),
          inArray(jobQueueTable.status, ["completed", "failed", "cancelled"])
        )
      )
      .returning();

    res.json({ success: true, count: deleted.length });
  } catch (error) {
    console.error("Failed to clear jobs:", error);
    res.status(500).json({ error: "Failed to clear jobs" });
  }
});

// POST /jobs/:id/retry - Retry a failed job
router.post("/jobs/:id/retry", async (req, res) => {
  const user = (req as any).user;
  const jobId = parseInt(req.params.id);

  if (isNaN(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  try {
    const [existingJob] = await db
      .select()
      .from(jobQueueTable)
      .where(and(eq(jobQueueTable.id, jobId), eq(jobQueueTable.userId, user.id)));

    if (!existingJob) {
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const [job] = await db
      .update(jobQueueTable)
      .set({
        status: "pending",
        retryCount: existingJob.retryCount + 1,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(jobQueueTable.id, jobId))
      .returning();

    res.json(job);
  } catch (error) {
    console.error("Failed to retry job:", error);
    res.status(500).json({ error: "Failed to retry job" });
  }
});

// Workflow execution engine
async function executeWorkflow(
  workflow: typeof workflowsTable.$inferSelect,
  runId: number,
  userId: string
) {
  const actions = workflow.actions as Array<{ type: string; config: Record<string, unknown> }>;
  const results: Array<{ actionIndex: number; status: string; output?: unknown; error?: string }> = [];

  console.log(`[Workflow] Starting execution of workflow ${workflow.id}, run ${runId} with ${actions.length} actions`);

  try {
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      console.log(`[Workflow] Executing action ${i}: ${action.type}`, action.config);
      let result;

      try {
        switch (action.type) {
          case "tag":
            result = await executeTagAction(action.config as any, userId);
            break;
          case "generate_tags":
            result = await executeGenerateTagsAction(action.config.sourceId as number, action.config as any);
            break;
          case "move_to_folder":
            result = await executeMoveAction(action.config as any, userId);
            break;
          case "ai_organize":
            result = await executeAIOrganizeAction(action.config.sourceId as number, action.config as any, userId);
            break;
          case "summarize":
            result = await executeSummarizeAction(action.config as any, userId);
            break;
          case "transcribe":
            result = await executeTranscribeAction(action.config as any, userId);
            break;
          case "extract_entities":
            result = await executeExtractEntitiesAction(action.config as any, userId);
            break;
          case "send_notification":
            result = await executeSendNotificationAction(action.config as any, userId);
            break;
          case "webhook":
            result = await executeWebhookAction(action.config as any);
            break;
          case "ai_transform":
            result = await executeAITransformAction(action.config as any, userId);
            break;
          case "ai_agent_process":
            result = await executeAIAgentProcessAction(action.config as any, userId);
            break;
          default:
            throw new Error(`Unknown action type: ${action.type}`);
        }

        results.push({ actionIndex: i, status: "success", output: result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        results.push({ actionIndex: i, status: "failed", error: errorMessage });
        throw error; // Stop workflow on first failure
      }
    }

    // Mark workflow run as completed
    await db
      .update(workflowRunsTable)
      .set({
        status: "completed",
        completedAt: new Date(),
        actionResults: results,
      })
      .where(eq(workflowRunsTable.id, runId));

    // Increment workflow run count
    await db
      .update(workflowsTable)
      .set({
        runCount: workflow.runCount + 1,
        lastRunAt: new Date(),
      })
      .where(eq(workflowsTable.id, workflow.id));

    console.log(`[Workflow] Successfully completed run ${runId} with ${results.length} actions`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Workflow] Execution failed for run ${runId}:`, errorMessage);

    // Mark workflow run as failed
    await db
      .update(workflowRunsTable)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage,
        actionResults: results,
      })
      .where(eq(workflowRunsTable.id, runId));
  }
}

// Action executors
import { generateTags as aiGenerateTags, classifyContent as aiClassifyContent, completeText } from "../lib/ai";

async function executeAIOrganizeAction(sourceId: number, config: any, userId: string) {
  if (!sourceId) throw new Error("Missing sourceId");

  // 1. Get source
  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, sourceId));

  if (!source) throw new Error("Source not found");

  // 2. Get user folders
  const folders = await db
    .select()
    .from(pagesTable)
    .where(and(eq(pagesTable.userId, userId), eq(pagesTable.kind, "folder")));

  if (folders.length === 0) {
    console.log(`[AIOrganize] No folders found for user ${userId}. Skipping organization.`);
    return { moved: false, reason: "no_folders" };
  }

  const folderOptions = folders.map(f => f.title);
  const content = source.summary || source.content || source.title;

  console.log(`[AIOrganize] Classifying source ${sourceId} against folders: [${folderOptions.join(", ")}]`);

  // 3. AI Classify
  const bestMatchTitle = await aiClassifyContent(content, folderOptions);

  if (bestMatchTitle) {
    const targetFolder = folders.find(f => f.title === bestMatchTitle);
    if (targetFolder) {
      console.log(`[AIOrganize] Moving source ${sourceId} to folder "${bestMatchTitle}" (ID: ${targetFolder.id})`);
      
      await db.update(sourcesTable)
        .set({ parentPageId: targetFolder.id })
        .where(eq(sourcesTable.id, sourceId));

      return { moved: true, targetFolder: bestMatchTitle, folderId: targetFolder.id };
    }
  }

  console.log(`[AIOrganize] No matching folder found for source ${sourceId}`);
  return { moved: false, reason: "no_match" };
}

async function executeGenerateTagsAction(sourceId: number, config: any) {
  if (!sourceId) throw new Error("Missing sourceId");

  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, sourceId));

  if (!source) throw new Error("Source not found");

  const contentToAnalyze = source.summary || source.content || source.title;
  const tags = await aiGenerateTags(contentToAnalyze);

  if (tags.length === 0) {
    console.log(`[WorkflowAction:GenerateTags] No tags generated for source ${sourceId}`);
    return;
  }

  console.log(`[WorkflowAction:GenerateTags] Generated tags for source ${sourceId}: [${tags.join(", ")}]`);

  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) continue;

    await db.insert(sourceTagsTable)
      .values({
        sourceId,
        tag: normalized,
      })
      .onConflictDoNothing();
  }
}

async function executeTagAction(config: { tags?: string[]; sourceId?: number; replaceExisting?: boolean }, userId: string) {
  console.log(`[TagAction] Called with config:`, config);
  if (!config.sourceId) {
    throw new Error("Missing sourceId - workflow must be triggered by a source or run with a sourceId");
  }
  if (!config.tags || config.tags.length === 0) {
    throw new Error("Missing tags");
  }

  // If replaceExisting is true, delete existing tags first
  if (config.replaceExisting) {
    await db
      .delete(sourceTagsTable)
      .where(eq(sourceTagsTable.sourceId, config.sourceId));
  }

  // Insert new tags (skip duplicates)
  const inserted = [];
  for (const tag of config.tags) {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) continue;

    try {
      const [tagRecord] = await db
        .insert(sourceTagsTable)
        .values({
          sourceId: config.sourceId,
          tag: normalizedTag,
        })
        .onConflictDoNothing()
        .returning();
      
      if (tagRecord) inserted.push(normalizedTag);
    } catch (err) {
      console.error(`[TagAction] Failed to insert tag "${normalizedTag}":`, err);
    }
  }

  console.log(`[TagAction] Successfully applied ${inserted.length} tags to source ${config.sourceId}:`, inserted);
  return { tags: inserted, applied: inserted.length };
}

async function executeMoveAction(config: { folderId?: number; sourceId?: number }, userId: string) {
  if (!config.sourceId || config.folderId === undefined) {
    throw new Error("Missing sourceId or folderId");
  }

  await db
    .update(sourcesTable)
    .set({ parentPageId: config.folderId })
    .where(and(eq(sourcesTable.id, config.sourceId), eq(sourcesTable.userId, userId)));

  return { sourceId: config.sourceId, folderId: config.folderId };
}

async function executeSummarizeAction(config: { maxLength?: number; sourceId?: number }, userId: string) {
  // Queue a summarization job
  const [job] = await db
    .insert(jobQueueTable)
    .values({
      userId,
      jobType: "generate_summary",
      entityType: "source",
      entityId: config.sourceId || 0,
      payload: { maxLength: config.maxLength },
      status: "pending",
    })
    .returning();

  return { jobId: job.id };
}

async function executeTranscribeAction(config: { language?: string; sourceId?: number }, userId: string) {
  // Queue a transcription job
  const [job] = await db
    .insert(jobQueueTable)
    .values({
      userId,
      jobType: "transcribe",
      entityType: "source",
      entityId: config.sourceId || 0,
      payload: { language: config.language },
      status: "pending",
    })
    .returning();

  return { jobId: job.id };
}

async function executeExtractEntitiesAction(config: { entityTypes?: string[]; sourceId?: number }, userId: string) {
  // Queue an extraction job
  const [job] = await db
    .insert(jobQueueTable)
    .values({
      userId,
      jobType: "extract_entities",
      entityType: "source",
      entityId: config.sourceId || 0,
      payload: { entityTypes: config.entityTypes },
      status: "pending",
    })
    .returning();

  return { jobId: job.id };
}

async function executeSendNotificationAction(config: { message: string; notifyType?: string; subject?: string; emailRecipient?: string }, userId: string) {
  console.log(`[Notification] Sending ${config.notifyType || 'info'} to user ${userId}: ${config.message}`);
  
  if (config.notifyType === "email") {
    // 1. Fetch user's email integration settings
    const [settings] = await db
      .select()
      .from(emailIntegrationsTable)
      .where(eq(emailIntegrationsTable.userId, userId));

    if (!settings) {
      throw new Error("Email integration not configured. Please go to Settings > Email to set up Resend or SMTP.");
    }

    // 2. Fetch recipient email if not provided
    let recipient = config.emailRecipient;
    if (!recipient) {
      const [user] = await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      recipient = user?.email;
    }

    if (!recipient) {
      throw new Error("Recipient email not found.");
    }

    const subject = config.subject || "Eden Notification";
    const body = config.message;

    // 3. Send using selected provider
    if (settings.provider === "resend") {
      if (!settings.resendApiKey) throw new Error("Resend API Key is missing.");
      const resend = new Resend(settings.resendApiKey);
      const { data, error } = await resend.emails.send({
        from: settings.smtpFrom || "Eden <notifications@eden.ai>",
        to: recipient,
        subject,
        text: body,
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
      return { success: true, provider: "resend", messageId: data?.id };
    } else if (settings.provider === "smtp") {
      if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPass) {
        throw new Error("SMTP configuration is incomplete.");
      }
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: settings.smtpPort,
        secure: settings.smtpPort === 465,
        auth: {
          user: settings.smtpUser,
          pass: settings.smtpPass,
        },
      });

      const info = await transporter.sendMail({
        from: settings.smtpFrom || settings.smtpUser,
        to: recipient,
        subject,
        text: body,
      });
      return { success: true, provider: "smtp", messageId: info.messageId };
    } else {
      throw new Error(`Unsupported email provider: ${settings.provider}`);
    }
  }

  // Fallback for non-email notifications (e.g. internal system log or toast)
  return { success: true, sentAt: new Date().toISOString() };
}

async function executeWebhookAction(config: { url: string; method: string; headers?: Record<string, string>; body?: unknown }) {
  const response = await fetch(config.url, {
    method: config.method,
    headers: {
      "Content-Type": "application/json",
      ...config.headers,
    },
    body: config.body ? JSON.stringify(config.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return { status: response.status, url: config.url };
}

async function executeAITransformAction(config: { prompt: string; outputField: string; sourceId?: number }, userId: string) {
  // Queue an AI transformation job
  const [job] = await db
    .insert(jobQueueTable)
    .values({
      userId,
      jobType: "ai_transform",
      entityType: "source",
      entityId: config.sourceId || 0,
      payload: { prompt: config.prompt, outputField: config.outputField },
      status: "pending",
    })
    .returning();

  return { jobId: job.id };
}

async function executeAIAgentProcessAction(config: { agentId?: number; sourceId?: number }, userId: string) {
  if (!config.sourceId) throw new Error("Missing sourceId");
  if (!config.agentId) throw new Error("Missing agentId");

  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, config.sourceId));
  if (!source) throw new Error("Source not found");

  const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, config.agentId));
  if (!agent) throw new Error("Agent not found");

  const content = (source.content || source.summary || source.title).slice(0, 12000);

  const result = await completeText({
    system: agent.prompt,
    user: `Process the following content:\n\n${content}`,
    maxTokens: 1000,
  });

  await db
    .update(sourcesTable)
    .set({ summary: result })
    .where(eq(sourcesTable.id, config.sourceId));

  console.log(`[AIAgentProcess] Agent "${agent.name}" processed source ${config.sourceId}`);
  return { output: result, agentName: agent.name };
}

// Folder-agent management endpoints

// GET /workflows/folder-agent/:folderId — get assigned agent for a folder
router.get("/workflows/folder-agent/:folderId", async (req, res) => {
  const user = (req as any).user;
  const folderId = parseInt(req.params.folderId);
  if (isNaN(folderId)) { res.status(400).json({ error: "Invalid folderId" }); return; }

  try {
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.userId, user.id), eq(workflowsTable.isActive, true)));

    const folderAgentWorkflow = workflows.find((w) => {
      const tc = w.triggerConfig as Record<string, unknown>;
      const actions = w.actions as Array<{ type: string; config: Record<string, unknown> }>;
      return Number(tc?.folderId) === folderId && actions.some((a) => a.type === "ai_agent_process");
    });

    if (!folderAgentWorkflow) { res.json(null); return; }

    const actions = folderAgentWorkflow.actions as Array<{ type: string; config: Record<string, unknown> }>;
    const agentAction = actions.find((a) => a.type === "ai_agent_process");
    const agentId = agentAction?.config?.agentId;
    if (!agentId) { res.json(null); return; }

    const [agent] = await db.select().from(agentsTable).where(eq(agentsTable.id, Number(agentId)));
    res.json({
      workflowId: folderAgentWorkflow.id,
      agent: agent ? { id: agent.id, name: agent.name, emoji: agent.emoji } : null,
    });
    return;
  } catch (error) {
    console.error("Failed to get folder agent:", error);
    res.status(500).json({ error: "Failed to get folder agent" });
    return;
  }
});

// POST /workflows/folder-agent/:folderId — assign an agent to a folder
router.post("/workflows/folder-agent/:folderId", async (req, res) => {
  const user = (req as any).user;
  const folderId = parseInt(req.params.folderId);
  if (isNaN(folderId)) { res.status(400).json({ error: "Invalid folderId" }); return; }

  try {
    const { agentId } = z.object({ agentId: z.number() }).parse(req.body);

    const [agent] = await db
      .select()
      .from(agentsTable)
      .where(and(eq(agentsTable.id, agentId), eq(agentsTable.userId, user.id)));
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }

    const [folder] = await db
      .select()
      .from(pagesTable)
      .where(and(eq(pagesTable.id, folderId), eq(pagesTable.userId, user.id)));
    if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }

    const workflows = await db.select().from(workflowsTable).where(eq(workflowsTable.userId, user.id));
    const existing = workflows.find((w) => {
      const tc = w.triggerConfig as Record<string, unknown>;
      const actions = w.actions as Array<{ type: string; config: Record<string, unknown> }>;
      return Number(tc?.folderId) === folderId && actions.some((a) => a.type === "ai_agent_process");
    });

    const workflowData = {
      name: `Agent: ${agent.name} → ${folder.title}`,
      description: `Auto-process files in "${folder.title}" with agent "${agent.name}"`,
      emoji: agent.emoji || "🤖",
      triggerType: "source_created" as const,
      triggerConfig: { folderId },
      actions: [{ type: "ai_agent_process", config: { agentId } }],
      isActive: true,
    };

    if (existing) {
      const [updated] = await db
        .update(workflowsTable)
        .set({ ...workflowData, updatedAt: new Date() })
        .where(eq(workflowsTable.id, existing.id))
        .returning();
      res.json({ workflowId: updated.id, agent: { id: agent.id, name: agent.name, emoji: agent.emoji } });
      return;
    }

    const [created] = await db
      .insert(workflowsTable)
      .values({ userId: user.id, ...workflowData, runCount: 0 })
      .returning();
    res.status(201).json({ workflowId: created.id, agent: { id: agent.id, name: agent.name, emoji: agent.emoji } });
    return;
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: "Invalid request body", details: error.errors }); return; }
    console.error("Failed to assign folder agent:", error);
    res.status(500).json({ error: "Failed to assign folder agent" });
    return;
  }
});

// DELETE /workflows/folder-agent/:folderId — remove folder agent assignment
router.delete("/workflows/folder-agent/:folderId", async (req, res) => {
  const user = (req as any).user;
  const folderId = parseInt(req.params.folderId);
  if (isNaN(folderId)) { res.status(400).json({ error: "Invalid folderId" }); return; }

  try {
    const workflows = await db.select().from(workflowsTable).where(eq(workflowsTable.userId, user.id));
    const existing = workflows.find((w) => {
      const tc = w.triggerConfig as Record<string, unknown>;
      const actions = w.actions as Array<{ type: string; config: Record<string, unknown> }>;
      return Number(tc?.folderId) === folderId && actions.some((a) => a.type === "ai_agent_process");
    });

    if (!existing) { res.status(404).json({ error: "No agent assigned to this folder" }); return; }

    await db.delete(workflowsTable).where(eq(workflowsTable.id, existing.id));
    res.json({ success: true });
    return;
  } catch (error) {
    console.error("Failed to remove folder agent:", error);
    res.status(500).json({ error: "Failed to remove folder agent" });
    return;
  }
});

// Function to trigger workflows based on events
export async function triggerWorkflows(
  triggerType: "source_created" | "source_updated",
  sourceId: number,
  userId: string,
  sourceData: { kind: string; parentPageId: number | null }
) {
  try {
    // Find matching workflows
    const workflows = await db
      .select()
      .from(workflowsTable)
      .where(
        and(
          eq(workflowsTable.userId, userId),
          eq(workflowsTable.triggerType, triggerType),
          eq(workflowsTable.isActive, true)
        )
      );

    for (const workflow of workflows) {
      const triggerConfig = workflow.triggerConfig as { sourceKind?: string[]; folderId?: number; anyFolder?: boolean };

      console.log(`[WorkflowTrigger] Checking workflow ${workflow.id} ("${workflow.name}") against source ${sourceId}`);
      
      // Check if workflow matches the source criteria
      let shouldTrigger = true;

      if (triggerConfig.sourceKind && triggerConfig.sourceKind.length > 0 && !triggerConfig.sourceKind.includes(sourceData.kind)) {
        console.log(`[WorkflowTrigger]  - Skip: sourceKind mismatch (${sourceData.kind} not in [${triggerConfig.sourceKind.join(", ")}])`);
        shouldTrigger = false;
      }

      if (shouldTrigger && !triggerConfig.anyFolder && triggerConfig.folderId !== undefined) {
        if (sourceData.parentPageId !== triggerConfig.folderId) {
          console.log(`[WorkflowTrigger]  - Skip: folderId mismatch (source in ${sourceData.parentPageId}, workflow expects ${triggerConfig.folderId})`);
          shouldTrigger = false;
        }
      }

      if (shouldTrigger) {
        console.log(`[WorkflowTrigger]  - Match! Creating run for workflow ${workflow.id}`);
        // Create workflow run
        const [run] = await db
          .insert(workflowRunsTable)
          .values({
            workflowId: workflow.id,
            triggerSourceId: sourceId,
            triggerData: { sourceId, kind: sourceData.kind },
            status: "running",
            actionResults: [],
          })
          .returning();

        // Inject sourceId into actions
        const actions = workflow.actions as Array<{ type: string; config: Record<string, unknown> }>;
        const actionsWithSource = actions.map((a) => ({
          ...a,
          config: { ...a.config, sourceId },
        }));

        // Execute with modified actions
        const workflowWithSource = { ...workflow, actions: actionsWithSource };
        executeWorkflow(workflowWithSource, run.id, userId);
      }
    }
  } catch (error) {
    console.error("Failed to trigger workflows:", error);
  }
}

export default router;
