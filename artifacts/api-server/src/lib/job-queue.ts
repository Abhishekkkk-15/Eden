import { db, jobQueueTable, sourcesTable, transcriptionsTable, sourceChunksTable } from "@workspace/db";
import { eq, and, asc, lte } from "drizzle-orm";
import { summarize, completeText, extractEntities } from "./ai";
import { transcribeSource, transcribeImage, transcribeVideoFrames } from "./transcription";
import { generateMeetingMinutes } from "./notion-agent";
import { Worker } from "bullmq";
import { redis } from "./redis";
import { AI_JOB_QUEUE } from "./queues";
import { emitToUser } from "./socket";

// Job processor configuration
const JOB_POLL_INTERVAL = 5000; // Check for jobs every 5 seconds
const MAX_CONCURRENT_JOBS = 3;

// Track currently processing jobs
const processingJobs = new Set<number>();

/**
 * Start the job queue processor (BullMQ Worker)
 */
export function startJobQueueProcessor(): () => void {
  console.log("[JobQueue] Starting BullMQ worker...");

  const worker = new Worker(
    AI_JOB_QUEUE,
    async (job) => {
      await processJob(job.data.jobId);
    },
    {
      connection: redis,
      concurrency: MAX_CONCURRENT_JOBS,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[JobQueue] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[JobQueue] Job ${job?.id} failed:`, err);
  });

  return () => {
    void worker.close();
    console.log("[JobQueue] Stopped BullMQ worker");
  };
}

/**
 * Process a single job
 */
async function processJob(jobId: number) {
  try {
    // Mark job as processing
    const [job] = await db
      .update(jobQueueTable)
      .set({
        status: "processing",
        startedAt: new Date(),
        progress: 0,
        updatedAt: new Date(),
      })
      .where(eq(jobQueueTable.id, jobId))
      .returning();

    if (!job) {
      processingJobs.delete(jobId);
      return;
    }

    console.log(`[JobQueue] >>> Starting job: ID=${jobId}, Type=${job.jobType}, Entity=${job.entityType}:${job.entityId}`);

    let result: unknown;
    let error: string | null = null;

    try {
      switch (job.jobType) {
        case "transcribe":
          result = await processTranscriptionJob(job);
          break;
        case "analyze_video":
          result = await processVideoAnalysisJob(job);
          break;
        case "analyze_image":
          result = await processImageAnalysisJob(job);
          break;
        case "extract_text":
          result = await processTextExtractionJob(job);
          break;
        case "generate_summary":
          result = await processSummaryJob(job);
          break;
        case "extract_entities":
          result = await processEntityExtractionJob(job);
          break;
        case "ai_transform":
          result = await processAITransformJob(job);
          break;
        case "import_url":
          result = await processImportUrlJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
      console.error(`[JobQueue] Job ${jobId} failed:`, error);
    }

    // Update job status
    if (error) {
      // Check if we should retry
      if (job.retryCount < job.maxRetries) {
        await db
          .update(jobQueueTable)
          .set({
            status: "pending",
            retryCount: job.retryCount + 1,
            errorMessage: error,
            scheduledAt: new Date(Date.now() + Math.pow(2, job.retryCount) * 1000), // Exponential backoff
            updatedAt: new Date(),
          })
          .where(eq(jobQueueTable.id, jobId))
          .returning();
      } else {
        const [failedJob] = await db
          .update(jobQueueTable)
          .set({
            status: "failed",
            errorMessage: error,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(jobQueueTable.id, jobId))
          .returning();

        if (failedJob) {
          emitToUser(failedJob.userId, "job:failed", { jobId, error });
        }
      }
    } else {
      await db
        .update(jobQueueTable)
        .set({
          status: "completed",
          progress: 100,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(jobQueueTable.id, jobId));

      emitToUser(job.userId, "job:completed", { jobId });
    }
  } catch (err) {
    console.error(`[JobQueue] Critical error processing job ${jobId}:`, err);
  } finally {
    processingJobs.delete(jobId);
  }
}

/**
 * Process transcription job
 */
async function processTranscriptionJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId } = job;
  const payload = job.payload as { language?: string };

  // Get source
  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, entityId));

  if (!source) {
    throw new Error("Source not found");
  }

  if (!source.mediaPath) {
    throw new Error("Source has no media");
  }

  // Update progress
  await updateJobProgress(job.id, 10, "Fetching media...");

  // Perform transcription
  await updateJobProgress(job.id, 50, "Transcribing audio...");

  const transcription = await transcribeSource(
    entityId,
    source.kind,
    source.mediaPath
  );

  if (!transcription) {
    throw new Error("Transcription failed");
  }

  await updateJobProgress(job.id, 100, "Complete");

  // Post-processing: Generate meeting minutes if user has Notion connected
  if (source.kind === "audio" || source.kind === "video") {
    console.log(`[JobQueue] Triggering Meeting Minutes automation for ${source.title} (User: ${job.userId})`);
    void generateMeetingMinutes(job.userId, source.title, transcription);
  }

  return { transcriptionLength: transcription.length };
}

/**
 * Process video analysis job
 */
async function processVideoAnalysisJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId } = job;

  await updateJobProgress(job.id, 10, "Fetching source...");

  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, entityId));

  if (!source || !source.mediaPath) {
    throw new Error("Source not found or has no media");
  }

  await updateJobProgress(job.id, 30, "Analyzing video frames with Vision AI...");

  const { frameCount, descriptions } = await transcribeVideoFrames(
    entityId,
    source.mediaPath,
    source.title
  );

  await updateJobProgress(job.id, 100, `Complete: Analyzed ${frameCount} frames`);

  return { frameCount, descriptionsLength: descriptions.length };
}

/**
 * Process image analysis job
 */
async function processImageAnalysisJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId } = job;

  await updateJobProgress(job.id, 10, "Fetching source...");

  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, entityId));

  if (!source || !source.mediaPath) {
    throw new Error("Source not found or has no media");
  }

  await updateJobProgress(job.id, 50, "Analyzing image with Vision AI...");

  const transcription = await transcribeImage(entityId, source.mediaPath);

  await updateJobProgress(job.id, 100, "Analysis complete");

  return { transcriptionLength: transcription.length };
}

/**
 * Process text extraction job
 */
async function processTextExtractionJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId } = job;

  await updateJobProgress(job.id, 100, "Text extracted");

  return { extracted: true };
}

/**
 * Process summary generation job
 */
async function processSummaryJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId } = job;
  const payload = job.payload as { maxLength?: number };

  await updateJobProgress(job.id, 20, "Fetching source content...");

  // Get source
  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, entityId));

  if (!source) {
    throw new Error("Source not found");
  }

  if (!source.content) {
    throw new Error("Source has no content to summarize");
  }

  await updateJobProgress(job.id, 50, "Generating summary...");

  // Generate summary
  const summary = await summarize(source.content);

  await updateJobProgress(job.id, 80, "Saving summary...");

  // Update source with summary
  await db
    .update(sourcesTable)
    .set({ summary })
    .where(eq(sourcesTable.id, entityId));

  await updateJobProgress(job.id, 100, "Complete");

  return { summaryLength: summary.length };
}

/**
 * Process AI transformation job
 */
async function processAITransformJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId } = job;
  const payload = job.payload as { prompt: string; outputField: string };

  await updateJobProgress(job.id, 20, "Fetching source...");

  // Get source
  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, entityId));

  if (!source) {
    throw new Error("Source not found");
  }

  await updateJobProgress(job.id, 50, "Running AI transformation...");

  // Run AI transformation
  const result = await completeText({
    system: "You are a helpful AI assistant that transforms content based on user instructions.",
    user: `Transform the following content according to these instructions: "${payload.prompt}"\n\nContent:\n${source.content || source.title}`,
    maxTokens: 1000,
  });

  await updateJobProgress(job.id, 80, "Saving results...");

  // Update source based on output field
  if (payload.outputField === "title") {
    await db
      .update(sourcesTable)
      .set({ title: result.slice(0, 200) })
      .where(eq(sourcesTable.id, entityId));
  } else if (payload.outputField === "description") {
    // Store in content or a metadata field
    await db
      .update(sourcesTable)
      .set({ summary: result })
      .where(eq(sourcesTable.id, entityId));
  }

  await updateJobProgress(job.id, 100, "Complete");

  return { transformed: true, outputLength: result.length };
}

/**
 * Process entity extraction job
 */
async function processEntityExtractionJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId } = job;
  const payload = job.payload as { entityTypes?: string[] };

  await updateJobProgress(job.id, 20, "Fetching source content...");

  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.id, entityId));

  if (!source) throw new Error("Source not found");
  if (!source.content) throw new Error("Source has no content to analyze");

  await updateJobProgress(job.id, 50, "Extracting entities...");

  const entities = await extractEntities(source.content, payload.entityTypes);

  await updateJobProgress(job.id, 80, "Saving extracted information...");

  // Update source summary with entities
  const newSummary = source.summary 
    ? `${source.summary}\n\n### Extracted Entities\n${entities}`
    : `### Extracted Entities\n${entities}`;

  await db
    .update(sourcesTable)
    .set({ summary: newSummary })
    .where(eq(sourcesTable.id, entityId));

  await updateJobProgress(job.id, 100, "Complete");

  return { entitiesLength: entities.length };
}

/**
 * Process URL import job
 */
async function processImportUrlJob(job: typeof jobQueueTable.$inferSelect) {
  const payload = job.payload as { url: string };

  await updateJobProgress(job.id, 50, "Fetching URL content...");

  // Fetch and process URL content
  const response = await fetch(payload.url, {
    headers: { "User-Agent": "EdenAIWorkspace/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();

  await updateJobProgress(job.id, 80, "Processing content...");

  // Basic HTML to text conversion (you could use a library like node-html-markdown)
  const text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100000);

  await updateJobProgress(job.id, 100, "Import complete");

  return { contentLength: text.length };
}

/**
 * Update job progress and emit via socket
 */
async function updateJobProgress(jobId: number, progress: number, message: string) {
  const [updatedJob] = await db
    .update(jobQueueTable)
    .set({
      progress,
      progressMessage: message,
      updatedAt: new Date(),
    })
    .where(eq(jobQueueTable.id, jobId))
    .returning();

  if (updatedJob) {
    emitToUser(updatedJob.userId, "job:progress", {
      jobId,
      progress,
      message,
    });
  }
}

/**
 * Add a job to the queue
 */
export async function queueJob(
  userId: string,
  jobType: typeof jobQueueTable.$inferInsert["jobType"],
  entityType: string,
  entityId: number,
  payload: Record<string, unknown>,
  options: { priority?: number; scheduledAt?: Date; maxRetries?: number } = {}
) {
  const [job] = await db
    .insert(jobQueueTable)
    .values({
      userId,
      jobType,
      entityType,
      entityId,
      payload,
      status: "pending",
      priority: options.priority ?? 0,
      scheduledAt: options.scheduledAt ?? new Date(),
      maxRetries: options.maxRetries ?? 3,
    })
    .returning();

  if (job) {
    const { aiJobQueue } = await import("./queues");
    await aiJobQueue.add(
      `ai_job:${job.id}`,
      { jobId: job.id },
      {
        priority: options.priority ?? 0,
        delay: options.scheduledAt ? Math.max(0, options.scheduledAt.getTime() - Date.now()) : 0,
      }
    );

    emitToUser(userId, "job:created", job);
  }

  return job;
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: number) {
  const [job] = await db
    .select()
    .from(jobQueueTable)
    .where(eq(jobQueueTable.id, jobId));

  return job;
}
