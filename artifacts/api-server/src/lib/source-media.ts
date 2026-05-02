import { transcribeAudio } from "@workspace/integrations-groq-ai-server";
import { uploadToCloudinary, deleteFromCloudinary } from "@workspace/integrations-cloudinary-ai-server";
import ytdl from "@distube/ytdl-core";
import { YoutubeTranscript } from "youtube-transcript";
import { describeImageDataUrl, summarize } from "./ai";

export type ParsedDataUrl = {
  mimeType: string;
  buffer: Buffer;
};

export function parseDataUrl(input: string): ParsedDataUrl {
  const match = input.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid fileDataUrl payload");
  }

  const [, mimeType, base64] = match;
  return {
    mimeType,
    buffer: Buffer.from(base64, "base64"),
  };
}

export async function persistUploadedFile(opts: {
  sourceId: number;
  originalFilename?: string | null;
  mimeType: string;
  buffer: Buffer;
}): Promise<string> {
  // Determine resource type for Cloudinary
  let resourceType: "image" | "video" | "raw" = "raw";
  if (opts.mimeType.startsWith("image/")) resourceType = "image";
  else if (opts.mimeType.startsWith("video/") || opts.mimeType.startsWith("audio/")) resourceType = "video";

  const result = await uploadToCloudinary({
    buffer: opts.buffer,
    folder: "eden/sources",
    resourceType,
  });

  // We return the full URL as the "path" for now
  return result.url;
}

export async function removeUploadedFile(url: string | null | undefined) {
  if (!url) return;
  // This is a bit tricky since we only have the URL. 
  // In a real app, we'd store the publicId in the DB.
  // For now, we'll just skip deletion or try to parse it.
}

export function getMediaUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `/media/${pathOrUrl}`;
}

export function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let videoId: string | null = null;
    if (host === "youtu.be") videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    else if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v");
      else if (parsed.pathname.startsWith("/embed/")) videoId = parsed.pathname.split("/")[2] ?? null;
      else if (parsed.pathname.startsWith("/shorts/")) videoId = parsed.pathname.split("/")[2] ?? null;
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

export async function extractImageContent(opts: {
  dataUrl: string;
  title: string;
  originalFilename?: string | null;
}): Promise<{ content: string; summary: string | null }> {
  try {
    const description = await describeImageDataUrl(opts.dataUrl);
    const content = description.trim();
    if (!content) return { content: "", summary: null };
    return { content, summary: await summarize(content) };
  } catch (err) {
    console.error("extractImageContent failed:", err);
    const fallback = `Image source titled "${opts.title}". Visual extraction is unavailable.`;
    return { content: fallback, summary: fallback };
  }
}

export async function extractVideoContent(opts: {
  buffer: Buffer;
  title: string;
  originalFilename?: string | null;
}): Promise<{ content: string; summary: string | null }> {
  try {
    const { text } = await transcribeAudio(opts.buffer, opts.originalFilename ?? undefined);
    const content = text.trim();
    if (!content) return { content: "", summary: null };
    return { content, summary: await summarize(content) };
  } catch (err) {
    console.error("extractVideoContent failed:", err);
    const fallback = `Video source titled "${opts.title}". Transcript unavailable.`;
    return { content: fallback, summary: fallback };
  }
}

export async function extractYouTubeContent(url: string): Promise<{ content: string; summary: string | null }> {
  try {
    // 1. Try fetching official/auto-generated captions (Fast & Reliable)
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      const content = transcript.map((t) => t.text).join(" ");
      if (content && content.trim().length > 0) {
        return {
          content: content.trim(),
          summary: await summarize(content),
        };
      }
    } catch (transcriptErr) {
      console.warn("YoutubeTranscript failed, falling back to audio extraction:", transcriptErr);
    }

    // 2. Fallback to audio stream extraction (use ytdl + Groq Whisper)
    const stream = ytdl(url, { quality: "lowestaudio", filter: "audioonly" });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const { text } = await transcribeAudio(buffer, "youtube.mp3");
    const content = text.trim();
    if (!content) return { content: "", summary: null };
    return { content, summary: await summarize(content) };
  } catch (err) {
    console.error("extractYouTubeContent failed completely:", err);
    return { 
      content: "Failed to extract transcript from YouTube video. The video might be restricted or restricted from your current server location.", 
      summary: null 
    };
  }
}
