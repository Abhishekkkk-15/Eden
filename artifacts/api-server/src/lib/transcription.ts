import { db, sourcesTable, transcriptionsTable, sourceChunksTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import {
  transcribeAudio,
} from "@workspace/integrations-groq-ai-server";
import { chunkText } from "./rag";

/**
 * Transcribe audio or video file using Groq Whisper
 */
export async function transcribeAudioVideo(sourceId: number, mediaUrl: string): Promise<string> {
  try {
    const response = await fetch(mediaUrl);
    if (!response.ok) throw new Error(`Failed to fetch media from ${mediaUrl}: ${response.statusText}`);
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    
    // Transcribe using Groq (whisper-large-v3)
    const { text: transcription, model } = await transcribeAudio(audioBuffer, mediaUrl);
    
    // Store in database
    await db.insert(transcriptionsTable).values({
      sourceId,
      content: transcription,
      model,
    }).onConflictDoUpdate({
      target: transcriptionsTable.sourceId,
      set: {
        content: transcription,
        model,
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
 * Store image transcription from already-extracted source content.
 * extractImageContent() already calls GPT-4o-mini vision during ingestion and
 * stores the result as source.content — reuse that to avoid a redundant API call.
 */
export async function transcribeImage(sourceId: number, _mediaPath: string): Promise<string> {
  try {
    // Read the content already extracted during ingestion (no second vision API call needed)
    const [source] = await db
      .select({ content: sourcesTable.content })
      .from(sourcesTable)
      .where(eq(sourcesTable.id, sourceId));

    const transcription = source?.content ?? "";

    // Store in transcriptions table so it can be queried via GET /sources/:id/transcription
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
          position: 2000 + i, // Different offset for image OCR chunks
          content: `[Image OCR] ${c}`,
        })),
      );
    }

    return transcription;
  } catch (error) {
    console.error(`Failed to store image transcription for source ${sourceId}:`, error);
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
