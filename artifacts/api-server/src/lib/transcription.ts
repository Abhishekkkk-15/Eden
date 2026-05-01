import { db, sourcesTable, transcriptionsTable, sourceChunksTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import {
  speechToText,
  ensureCompatibleFormat,
  openai,
} from "@workspace/integrations-openai-ai-server";
import { readFile } from "fs/promises";
import { join } from "path";
import { getUploadsDir } from "./source-media";
import { chunkText } from "./rag";

/**
 * Transcribe audio or video file using Whisper
 */
export async function transcribeAudioVideo(sourceId: number, mediaPath: string): Promise<string> {
  try {
    const fullPath = join(getUploadsDir(), mediaPath);
    const audioBuffer = await readFile(fullPath);
    
    // Convert to compatible format for Whisper
    const { buffer: compatibleBuffer, format } = await ensureCompatibleFormat(audioBuffer);
    
    // Transcribe using Whisper
    const transcription = await speechToText(compatibleBuffer, format);
    
    // Store in database
    await db.insert(transcriptionsTable).values({
      sourceId,
      content: transcription,
      model: "gpt-4o-mini-transcribe",
    }).onConflictDoUpdate({
      target: transcriptionsTable.sourceId,
      set: {
        content: transcription,
        model: "gpt-4o-mini-transcribe",
        updatedAt: new Date(),
      },
    });
    
    // Create searchable chunks from transcription
    const chunks = await chunkText(transcription);
    if (chunks.length > 0) {
      await db.insert(sourceChunksTable).values(
        chunks.map((c, i) => ({
          sourceId,
          position: 1000 + i, // Offset to separate from regular content chunks
          content: `[Transcription] ${c}`,
        })),
      );
    }
    
    return transcription;
  } catch (error) {
    console.error(`Failed to transcribe source ${sourceId}:`, error);
    throw error;
  }
}

/**
 * Extract text from image using GPT-4 Vision (OCR)
 */
export async function transcribeImage(sourceId: number, mediaPath: string): Promise<string> {
  try {
    const fullPath = join(getUploadsDir(), mediaPath);
    const imageBuffer = await readFile(fullPath);
    const base64Image = imageBuffer.toString("base64");
    
    // Determine MIME type from extension
    const ext = mediaPath.split(".").pop()?.toLowerCase() || "png";
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : 
                     ext === "png" ? "image/png" : 
                     ext === "gif" ? "image/gif" : 
                     ext === "webp" ? "image/webp" : "image/jpeg";
    
    // Use GPT-4 Vision to extract text from image
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract and transcribe all visible text from this image. If there's no text, describe what you see in detail. Return only the transcription or description, no additional commentary.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2000,
    });
    
    const transcription = response.choices[0]?.message?.content || "";
    
    // Store in database
    await db.insert(transcriptionsTable).values({
      sourceId,
      content: transcription,
      model: "gpt-4o-mini",
    }).onConflictDoUpdate({
      target: transcriptionsTable.sourceId,
      set: {
        content: transcription,
        model: "gpt-4o-mini",
        updatedAt: new Date(),
      },
    });
    
    // Create searchable chunks from transcription
    const chunks = await chunkText(transcription);
    if (chunks.length > 0) {
      await db.insert(sourceChunksTable).values(
        chunks.map((c, i) => ({
          sourceId,
          position: 2000 + i, // Different offset for image OCR
          content: `[Image OCR] ${c}`,
        })),
      );
    }
    
    return transcription;
  } catch (error) {
    console.error(`Failed to transcribe image ${sourceId}:`, error);
    throw error;
  }
}

/**
 * Check if a source needs transcription based on its kind
 */
export function needsTranscription(kind: string): boolean {
  return ["video", "audio", "image"].includes(kind);
}

/**
 * Transcribe a source based on its type
 */
export async function transcribeSource(sourceId: number, kind: string, mediaPath: string | null): Promise<string | null> {
  if (!mediaPath) return null;
  if (!needsTranscription(kind)) return null;
  
  if (kind === "image") {
    return await transcribeImage(sourceId, mediaPath);
  }
  
  // video and audio both use Whisper
  return await transcribeAudioVideo(sourceId, mediaPath);
}

/**
 * Get transcription for a source
 */
export async function getTranscription(sourceId: number): Promise<string | null> {
  const [transcription] = await db
    .select({ content: transcriptionsTable.content })
    .from(transcriptionsTable)
    .where(eq(transcriptionsTable.sourceId, sourceId));
  
  return transcription?.content || null;
}

/**
 * Search transcriptions by keyword
 */
export async function searchTranscriptions(keyword: string): Promise<Array<{ sourceId: number; content: string }>> {
  const results = await db
    .select({
      sourceId: transcriptionsTable.sourceId,
      content: transcriptionsTable.content,
    })
    .from(transcriptionsTable)
    .where(ilike(transcriptionsTable.content, `%${keyword}%`));

  return results;
}
