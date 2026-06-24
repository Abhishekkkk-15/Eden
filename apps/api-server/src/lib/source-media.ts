import { transcribeAudio } from "@workspace/integrations-groq-ai-server";
import { uploadToCloudinary, deleteFromCloudinary } from "@workspace/integrations-cloudinary-ai-server";
import ytdl from "@distube/ytdl-core";
import { YoutubeTranscript } from "youtube-transcript";
import { describeImageDataUrl, summarize } from "./ai";
import { extractAndAnalyzeVideoFrames } from "./video-frames";

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
}): Promise<{ content: string; summary: string | null; visualDescription?: string }> {
  try {
    // 1. Extract audio transcription
    const { text: audioText } = await transcribeAudio(opts.buffer, opts.originalFilename ?? undefined);
    const audioContent = audioText.trim();

    // 2. Extract visual frames and analyze with vision
    let visualDescription = "";
    try {
      const { combinedDescription } = await extractAndAnalyzeVideoFrames(
        opts.buffer,
        opts.title,
        {
          intervalSeconds: 5,
          maxFrames: 20,
          width: 512,
        }
      );
      visualDescription = combinedDescription;
    } catch (visualErr) {
      console.warn("Visual frame extraction failed:", visualErr);
    }

    // 3. Combine audio and visual content
    let combinedContent = "";
    if (audioContent && visualDescription) {
      combinedContent = `AUDIO TRANSCRIPTION:\n${audioContent}\n\nVISUAL ANALYSIS:\n${visualDescription}`;
    } else if (audioContent) {
      combinedContent = audioContent;
    } else if (visualDescription) {
      combinedContent = visualDescription;
    } else {
      return { content: "", summary: null };
    }

    return {
      content: combinedContent,
      summary: await summarize(combinedContent),
      visualDescription,
    };
  } catch (err) {
    console.error("extractVideoContent failed:", err);
    const fallback = `Video source titled "${opts.title}". Content extraction unavailable.`;
    return { content: fallback, summary: fallback };
  }
}

export async function extractYouTubeContent(url: string): Promise<{ content: string; summary: string | null; visualDescription?: string }> {
  try {
    let audioContent = "";
    let visualDescription = "";

    // 1. Try fetching official/auto-generated captions (Fast & Reliable)
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      audioContent = transcript.map((t) => t.text).join(" ");
    } catch (transcriptErr) {
      console.warn("YoutubeTranscript failed, will try audio extraction:", transcriptErr);
    }

    // 2. Download video for both audio and visual analysis
    try {
      // Download video (low quality for faster processing)
      const videoStream = ytdl(url, {
        quality: "lowest",
        filter: (format) => format.hasVideo && format.hasAudio,
      });

      const chunks: Buffer[] = [];
      for await (const chunk of videoStream) chunks.push(chunk);
      const videoBuffer = Buffer.concat(chunks);

      // Extract audio if we don't have transcript
      if (!audioContent) {
        try {
          const audioStream = ytdl(url, { quality: "lowestaudio", filter: "audioonly" });
          const audioChunks: Buffer[] = [];
          for await (const chunk of audioStream) audioChunks.push(chunk);
          const audioBuffer = Buffer.concat(audioChunks);
          const { text } = await transcribeAudio(audioBuffer, "youtube.mp3");
          audioContent = text.trim();
        } catch (audioErr) {
          console.warn("Audio extraction failed:", audioErr);
        }
      }

      // Extract visual frames
      try {
        const { combinedDescription } = await extractAndAnalyzeVideoFrames(
          videoBuffer,
          "YouTube Video",
          {
            intervalSeconds: 10, // Less frequent for YouTube (longer videos)
            maxFrames: 15,
            width: 512,
          }
        );
        visualDescription = combinedDescription;
      } catch (visualErr) {
        console.warn("Visual frame extraction failed for YouTube:", visualErr);
      }
    } catch (downloadErr) {
      console.warn("Video download failed, trying audio-only fallback:", downloadErr);

      // Fallback to audio-only
      if (!audioContent) {
        const stream = ytdl(url, { quality: "lowestaudio", filter: "audioonly" });
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        const { text } = await transcribeAudio(buffer, "youtube.mp3");
        audioContent = text.trim();
      }
    }

    // Combine results
    let combinedContent = "";
    if (audioContent && visualDescription) {
      combinedContent = `AUDIO TRANSCRIPTION:\n${audioContent}\n\nVISUAL ANALYSIS:\n${visualDescription}`;
    } else if (audioContent) {
      combinedContent = audioContent;
    } else if (visualDescription) {
      combinedContent = visualDescription;
    } else {
      return {
        content: "Failed to extract content from YouTube video. The video might be restricted.",
        summary: null,
      };
    }

    return {
      content: combinedContent.trim(),
      summary: await summarize(combinedContent),
      visualDescription: visualDescription || undefined,
    };
  } catch (err) {
    console.error("extractYouTubeContent failed completely:", err);
    return {
      content: "Failed to extract content from YouTube video. The video might be restricted or restricted from your current server location.",
      summary: null,
    };
  }
}
