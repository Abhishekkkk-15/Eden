import { db, jobQueueTable, sourcesTable, transcriptionsTable, sourceChunksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { summarize, completeText, extractEntities, generateEmbedding } from "../infrastructure/ai";
import { transcribeSource, transcribeImage, transcribeVideoFrames } from "../modules/sources/transcription";
import { generateMeetingMinutes } from "./notion-agent";
import { Worker } from "bullmq";
import { redis } from "../infrastructure/redis";
import { AI_JOB_QUEUE } from "../infrastructure/queues";
import { emitToUser } from "../infrastructure/socket";
import { chunkText } from "../infrastructure/rag";
import { pgvectorEnabled } from "../infrastructure/embed-init";
import {
  extractImageContent,
  extractVideoContent,
  extractYouTubeContent,
  fetchUrl,
  fetchBufferFromUrl,
} from "../modules/sources/media";
import { triggerWorkflows } from "../modules/workflows/workflows.routes";

const MAX_CONCURRENT_JOBS = Math.max(1, parseInt(process.env["JOB_CONCURRENCY"] ?? "5", 10));

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
  const [job] = await db
    .update(jobQueueTable)
    .set({ status: "processing", startedAt: new Date(), progress: 0, updatedAt: new Date() })
    .where(eq(jobQueueTable.id, jobId))
    .returning();

  if (!job || !job.userId) return;

  const { userId } = job;
  console.log(`[JobQueue] Starting job: ID=${jobId}, Type=${job.jobType}, Entity=${job.entityType}:${job.entityId}`);

  try {
    switch (job.jobType) {
      case "ingest_source":    await processIngestSourceJob(job); break;
      case "transcribe":       await processTranscriptionJob(job); break;
      case "analyze_video":    await processVideoAnalysisJob(job); break;
      case "analyze_image":    await processImageAnalysisJob(job); break;
      case "extract_text":     await processTextExtractionJob(job); break;
      case "generate_summary": await processSummaryJob(job); break;
      case "extract_entities": await processEntityExtractionJob(job); break;
      case "ai_transform":     await processAITransformJob(job); break;
      case "import_url":       await processImportUrlJob(job); break;
      default: throw new Error(`Unknown job type: ${job.jobType}`);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[JobQueue] Job ${jobId} failed:`, errorMessage);
    await db
      .update(jobQueueTable)
      .set({ status: "failed", errorMessage, completedAt: new Date(), updatedAt: new Date() })
      .where(eq(jobQueueTable.id, jobId));
    emitToUser(userId, "job:failed", { jobId, error: errorMessage });
    throw err; // Let BullMQ handle retries (attempts: 3, exponential backoff)
  }

  await db
    .update(jobQueueTable)
    .set({ status: "completed", progress: 100, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobQueueTable.id, jobId));
  emitToUser(userId, "job:completed", { jobId });
}

/**
 * Full ingestion pipeline for directly uploaded sources (text, url, youtube, image, video, audio).
 * Replaces the old fire-and-forget block in sources.routes.ts.
 */
async function processIngestSourceJob(job: typeof jobQueueTable.$inferSelect) {
  const { entityId, userId } = job;
  const payload = job.payload as {
    kind: string;
    url?: string | null;
    originalFilename?: string | null;
    parentPageId?: number | null;
  };
  const { kind, url, originalFilename, parentPageId } = payload;

  const [source] = await db.select().from(sourcesTable).where(eq(sourcesTable.id, entityId));
  if (!source) throw new Error("Source not found");

  await updateJobProgress(job.id, 10, "Preparing...");

  let content = source.content ?? "";
  let audioText = "";
  let audioModel = "";

  if (kind === "url") {
    await updateJobProgress(job.id, 20, "Fetching URL content...");
    content = await fetchUrl(url!);
  } else if (kind === "youtube") {
    await updateJobProgress(job.id, 20, "Extracting YouTube content...");
    const extracted = await extractYouTubeContent(url!);
    content = extracted.content;
  } else if (kind === "image") {
    await updateJobProgress(job.id, 20, "Analyzing image with Vision AI...");
    const buffer = await fetchBufferFromUrl(source.mediaPath!);
    const mimeType = source.mediaMimeType ?? "image/jpeg";
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const extracted = await extractImageContent({ dataUrl, title: source.title, originalFilename });
    content = extracted.content;
  } else if (kind === "video" || kind === "audio") {
    await updateJobProgress(job.id, 20, `Extracting ${kind} content...`);
    const buffer = await fetchBufferFromUrl(source.mediaPath!);
    const extracted = await extractVideoContent({ buffer, title: source.title, originalFilename });
    content = extracted.content;
    audioText = extracted.audioText;
    audioModel = extracted.audioModel;
  }

  await updateJobProgress(job.id, 50, "Chunking content...");
  const chunks = await chunkText(content);

  await updateJobProgress(job.id, 65, "Generating summary...");
  let summary: string | null = null;
  try {
    summary = kind === "image" ? (content || null) : await summarize(content);
  } catch (e) {
    console.warn(`[IngestSource] Summary generation failed (non-critical) for source ${entityId}:`, e);
  }

  await updateJobProgress(job.id, 80, "Saving...");
  await db.transaction(async (tx) => {
    await tx
      .update(sourcesTable)
      .set({ content, summary, status: "ready" })
      .where(eq(sourcesTable.id, entityId));
    if (chunks.length > 0) {
      await tx.insert(sourceChunksTable).values(
        chunks.map((c, i) => ({ sourceId: entityId, position: i, content: c })),
      );
    }
  });

  if (userId) {
    emitToUser(userId, "source:updated", { sourceId: entityId, status: "ready", title: source.title });
    emitToUser(userId, "job:completed", { jobId: job.id, entityId, entityType: "source" });
  }

  // Transcription record + video audio chunks + meeting minutes (non-blocking, best-effort)
  void (async () => {
    try {
      if (kind === "image" && content) {
        await db.insert(transcriptionsTable).values({
          sourceId: entityId,
          content,
          model: "nvidia/llama-3.2-11b-vision-instruct",
        }).onConflictDoUpdate({
          target: transcriptionsTable.sourceId,
          set: { content, model: "nvidia/llama-3.2-11b-vision-instruct", updatedAt: new Date() },
        });
      } else if ((kind === "audio" || kind === "video") && audioText) {
        await db.insert(transcriptionsTable).values({
          sourceId: entityId,
          content: audioText,
          model: audioModel,
        }).onConflictDoUpdate({
          target: transcriptionsTable.sourceId,
          set: { content: audioText, model: audioModel, updatedAt: new Date() },
        });
        // For video: index audio transcript at 1000+ separately from the combined content at 0+
        if (kind === "video") {
          const audioChunks = await chunkText(audioText);
          if (audioChunks.length > 0) {
            await db.insert(sourceChunksTable).values(
              audioChunks.map((c, i) => ({
                sourceId: entityId,
                position: 1000 + i,
                content: `[Transcription] ${c}`,
              })),
            );
          }
        }
        if (userId) {
          void generateMeetingMinutes(userId, source.title, audioText);
        }
      }
    } catch (e) {
      console.warn(`[IngestSource] Post-save tasks failed (non-critical) for source ${entityId}:`, e);
    }
  })();

  // Embeddings — best-effort, non-blocking
  if (pgvectorEnabled && chunks.length > 0) {
    void (async () => {
      try {
        await Promise.all(
          chunks.map(async (chunk, i) => {
            const embedding = await generateEmbedding(chunk);
            const vectorStr = `[${embedding.join(",")}]`;
            await db.execute(sql`
              UPDATE source_chunks
              SET embedding = ${vectorStr}::vector
              WHERE source_id = ${entityId} AND position = ${i}
            `);
          }),
        );
      } catch (e) {
        console.warn(`[IngestSource] Embedding generation failed (non-critical) for source ${entityId}:`, e);
      }
    })();
  }

  void triggerWorkflows("source_created", entityId, userId!, { kind, parentPageId: parentPageId ?? null });

  await updateJobProgress(job.id, 100, "Complete");
  return { processed: true };
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
  if ((source.kind === "audio" || source.kind === "video") && job.userId) {
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

  if (updatedJob?.userId) {
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
    const { aiJobQueue } = await import("../infrastructure/queues");
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
