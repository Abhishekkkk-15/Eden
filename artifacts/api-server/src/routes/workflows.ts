import { Router, type IRouter } from "express";
import { db, workflowsTable, workflowRunsTable, jobQueueTable, sourcesTable, sourceTagsTable } from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { z } from "zod";

const router: IRouter = Router();

// Validation schemas - more lenient for UI compatibility
const WorkflowActionSchema = z.object({
  type: z.enum(["tag", "move_to_folder", "summarize", "transcribe", "extract_entities", "send_notification", "webhook", "ai_transform"]),
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
    return res.status(400).json({ error: "Invalid workflow ID" });
  }

  try {
    const [workflow] = await db
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, user.id)));

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
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
    return res.status(400).json({ error: "Invalid workflow ID" });
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
      return res.status(404).json({ error: "Workflow not found" });
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
    return res.status(400).json({ error: "Invalid workflow ID" });
  }

  try {
    const [workflow] = await db
      .delete(workflowsTable)
      .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, user.id)))
      .returning();

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
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
    return res.status(400).json({ error: "Invalid workflow ID" });
  }

  try {
    const [workflow] = await db
      .select()
      .from(workflowsTable)
      .where(and(eq(workflowsTable.id, workflowId), eq(workflowsTable.userId, user.id)));

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
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
    return res.status(400).json({ error: "Invalid workflow ID" });
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
    return res.status(400).json({ error: "Invalid job ID" });
  }

  try {
    const [job] = await db
      .update(jobQueueTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(jobQueueTable.id, jobId), eq(jobQueueTable.userId, user.id)))
      .returning();

    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    res.json(job);
  } catch (error) {
    console.error("Failed to cancel job:", error);
    res.status(500).json({ error: "Failed to cancel job" });
  }
});

// POST /jobs/:id/retry - Retry a failed job
router.post("/jobs/:id/retry", async (req, res) => {
  const user = (req as any).user;
  const jobId = parseInt(req.params.id);

  if (isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job ID" });
  }

  try {
    const [existingJob] = await db
      .select()
      .from(jobQueueTable)
      .where(and(eq(jobQueueTable.id, jobId), eq(jobQueueTable.userId, user.id)));

    if (!existingJob) {
      return res.status(404).json({ error: "Job not found" });
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
            result = await executeTagAction(action.config, userId);
            break;
          case "move_to_folder":
            result = await executeMoveAction(action.config, userId);
            break;
          case "summarize":
            result = await executeSummarizeAction(action.config, userId);
            break;
          case "transcribe":
            result = await executeTranscribeAction(action.config, userId);
            break;
          case "send_notification":
            result = { success: true, message: action.config.message };
            break;
          case "webhook":
            result = await executeWebhookAction(action.config);
            break;
          case "ai_transform":
            result = await executeAITransformAction(action.config, userId);
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
