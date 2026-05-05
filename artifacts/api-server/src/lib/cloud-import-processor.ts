import {
  db,
  cloudImportQueueTable,
  cloudIntegrationsTable,
  sourcesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { triggerWorkflows } from "../routes/workflows";
import { persistUploadedFile } from "./source-media";
import { queueJob } from "./job-queue";

// Poll every 5 seconds
const POLL_INTERVAL = 5000;
const MAX_CONCURRENT = 3;

const processing = new Set<number>();

// ── Mime-type → Eden source kind mapping ─────────────────────────────────────
function getMimeFromExtension(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "mp4": return "video/mp4";
    case "webm": return "video/webm";
    case "mov": return "video/quicktime";
    case "mp3": return "audio/mpeg";
    case "wav": return "audio/wav";
    case "m4a": return "audio/mp4";
    case "pdf": return "application/pdf";
    case "txt": return "text/plain";
    case "md": return "text/markdown";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default: return null;
  }
}

function mimeToKind(mimeType: string | null | undefined): string {
  if (!mimeType) return "document";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "text/plain" || mimeType === "application/pdf") return "document";
  return "document";
}

// ── Download a file from Dropbox ──────────────────────────────────────────────
async function downloadFromDropbox(
  accessToken: string,
  filePath: string
): Promise<Buffer> {
  const response = await fetch(
    "https://content.dropboxapi.com/2/files/download",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: filePath }),
      },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Dropbox download failed ${response.status}: ${text}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Download a file from Google Drive ────────────────────────────────────────
async function downloadFromGoogleDrive(
  accessToken: string,
  fileId: string,
  mimeType: string | null | undefined
): Promise<Buffer> {
  let url: string;

  // Google Workspace docs (Docs, Sheets, Slides) must be exported
  if (mimeType?.startsWith("application/vnd.google-apps.")) {
    const exportMime = mimeType.includes("document")
      ? "text/plain"
      : "application/pdf";
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Google Drive download failed ${response.status}: ${text}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Process a single queue item ───────────────────────────────────────────────
async function processQueueItem(itemId: number) {
  try {
    // Mark as downloading
    const [item] = await db
      .update(cloudImportQueueTable)
      .set({ status: "downloading", updatedAt: new Date() })
      .where(eq(cloudImportQueueTable.id, itemId))
      .returning();

    if (!item) {
      processing.delete(itemId);
      return;
    }

    console.log(
      `[CloudImport] Processing item ${itemId} — ${item.providerFileName}`
    );

    // Load the integration (access token, provider)
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, item.integrationId),
          eq(cloudIntegrationsTable.isActive, true)
        )
      );

    if (!integration) {
      throw new Error("Integration not found or inactive");
    }

    // ── Download the file ──────────────────────────────────────────────────
    let fileBuffer: Buffer;
    const filePath = item.providerFilePath ?? item.providerFileId;

    if (integration.provider === "dropbox") {
      fileBuffer = await downloadFromDropbox(integration.accessToken, filePath);
    } else if (integration.provider === "google_drive") {
      fileBuffer = await downloadFromGoogleDrive(
        integration.accessToken,
        item.providerFileId,
        item.mimeType
      );
    } else {
      throw new Error(`Unsupported provider: ${integration.provider}`);
    }

    console.log(
      `[CloudImport] Downloaded ${item.providerFileName} (${fileBuffer.length} bytes)`
    );

    // ── Mark as processing ─────────────────────────────────────────────────
    await db
      .update(cloudImportQueueTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(cloudImportQueueTable.id, itemId));

    // ── Create the source record first (so we have an ID for Cloudinary) ──
    let mimeType = item.mimeType;
    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = getMimeFromExtension(item.providerFileName) ?? "application/octet-stream";
    }
    const kind = mimeToKind(mimeType);

    const [source] = await db
      .insert(sourcesTable)
      .values({
        userId: item.userId,
        title: item.providerFileName,
        kind: kind as any,
        content: "",
        mediaMimeType: mimeType,
        mediaSizeBytes: item.fileSize ?? null,
        parentPageId: item.targetPageId ?? null,
        status: "processing", // Start in processing status
      })
      .returning();

    if (!source) {
      throw new Error("Failed to create source record");
    }

    // ── Upload to Cloudinary ───────────────────────────────────────────────
    let mediaPath: string | null = null;
    try {
      mediaPath = await persistUploadedFile({
        sourceId: source.id,
        originalFilename: item.providerFileName,
        mimeType,
        buffer: fileBuffer,
      });

      // Update the source with the Cloudinary URL
      await db
        .update(sourcesTable)
        .set({ mediaPath, updatedAt: new Date() })
        .where(eq(sourcesTable.id, source.id));
    } catch (uploadErr) {
      console.warn(
        `[CloudImport] Cloudinary upload failed for item ${itemId}:`,
        uploadErr
      );
      // Continue — the source record is still useful even without media
    }

    // ── Mark queue item as completed ───────────────────────────────────────
    await db
      .update(cloudImportQueueTable)
      .set({
        status: "completed",
        sourceId: source.id,
        updatedAt: new Date(),
      })
      .where(eq(cloudImportQueueTable.id, itemId));

    console.log(
      `[CloudImport] ✓ Item ${itemId} → source ${source.id} (${item.providerFileName})`
    );

    // ── Trigger AI Jobs ────────────────────────────────────────────────────
    try {
      if (kind === "audio" || kind === "video") {
        await queueJob(item.userId, "transcribe", "source", source.id, {});
      } else if (kind === "image") {
        await queueJob(item.userId, "analyze_image", "source", source.id, {});
      } else if (kind === "document") {
        // For documents, we might need to extract text first if we had a parser
        // For now, just queue summary which will try to use the content
        await queueJob(item.userId, "generate_summary", "source", source.id, {});
      }
      console.log(`[CloudImport] Queued AI jobs for source ${source.id}`);
    } catch (jobErr) {
      console.error(`[CloudImport] Failed to queue jobs for source ${source.id}:`, jobErr);
    }

    // ── Trigger Workflows ──────────────────────────────────────────────────
    try {
      void triggerWorkflows("source_created", source.id, item.userId, {
        kind: kind,
        parentPageId: item.targetPageId ?? null,
      });
      console.log(`[CloudImport] Triggered workflows for source ${source.id}`);
    } catch (workflowErr) {
      console.error(`[CloudImport] Failed to trigger workflows for source ${source.id}:`, workflowErr);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[CloudImport] ✗ Item ${itemId} failed:`, message);

    await db
      .update(cloudImportQueueTable)
      .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
      .where(eq(cloudImportQueueTable.id, itemId));
  } finally {
    processing.delete(itemId);
  }
}

// ── Poll for pending items ────────────────────────────────────────────────────
async function pollCloudImportQueue() {
  if (processing.size >= MAX_CONCURRENT) return;

  try {
    const available = MAX_CONCURRENT - processing.size;

    const pendingItems = await db
      .select()
      .from(cloudImportQueueTable)
      .where(eq(cloudImportQueueTable.status, "pending"))
      .limit(available);

    for (const item of pendingItems) {
      if (!processing.has(item.id)) {
        processing.add(item.id);
        void processQueueItem(item.id);
      }
    }
  } catch (err) {
    console.error("[CloudImport] Error polling queue:", err);
  }
}

// ── Public: start the processor ───────────────────────────────────────────────
export function startCloudImportProcessor(): () => void {
  console.log("[CloudImport] Starting cloud import processor...");

  // Run immediately, then on interval
  void pollCloudImportQueue();
  const interval = setInterval(pollCloudImportQueue, POLL_INTERVAL);

  return () => {
    clearInterval(interval);
    console.log("[CloudImport] Stopped cloud import processor");
  };
}
