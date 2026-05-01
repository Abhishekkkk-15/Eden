import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { convertToWav, speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { describeImageDataUrl, summarize } from "./ai";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(currentDir, "..", "..", "uploads");

export type ParsedDataUrl = {
  mimeType: string;
  buffer: Buffer;
};

export async function ensureUploadsDir(): Promise<void> {
  await mkdir(uploadsDir, { recursive: true });
}

export function getUploadsDir(): string {
  return uploadsDir;
}

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

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export function extensionFromMimeType(mimeType: string): string {
  const known: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
  };

  return known[mimeType] ?? "";
}

export async function persistUploadedFile(opts: {
  sourceId: number;
  originalFilename?: string | null;
  mimeType: string;
  buffer: Buffer;
}): Promise<string> {
  await ensureUploadsDir();

  const extension =
    path.extname(opts.originalFilename ?? "") || extensionFromMimeType(opts.mimeType);
  const baseName = sanitizeFilename(
    path.basename(opts.originalFilename ?? `source-${opts.sourceId}`, extension),
  );
  const filename = `${opts.sourceId}-${Date.now()}-${baseName}${extension}`;
  const absolutePath = path.join(uploadsDir, filename);

  await writeFile(absolutePath, opts.buffer);

  return filename;
}

export async function removeUploadedFile(relativePath: string | null | undefined) {
  if (!relativePath) return;
  await unlink(path.join(uploadsDir, relativePath)).catch(() => {});
}

export function getMediaUrl(relativePath: string | null | undefined): string | null {
  return relativePath ? `/media/${relativePath}` : null;
}

export function getYouTubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    let videoId: string | null = null;

    if (host === "youtu.be") {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (parsed.pathname === "/watch") {
        videoId = parsed.searchParams.get("v");
      } else if (parsed.pathname.startsWith("/embed/")) {
        videoId = parsed.pathname.split("/")[2] ?? null;
      } else if (parsed.pathname.startsWith("/shorts/")) {
        videoId = parsed.pathname.split("/")[2] ?? null;
      }
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
}): Promise<{
  content: string;
  summary: string | null;
}> {
  try {
    const description = await describeImageDataUrl(opts.dataUrl);
    const content = description.trim();
    if (!content) {
      return { content: "", summary: null };
    }

    return {
      content,
      summary: await summarize(content),
    };
  } catch {
    const fallbackParts = [
      `Image source titled "${opts.title}".`,
      opts.originalFilename ? `Original filename: ${opts.originalFilename}.` : null,
      "Visual extraction is unavailable on the current AI backend, so only source metadata was indexed.",
    ].filter(Boolean);

    const fallback = fallbackParts.join(" ");
    return {
      content: fallback,
      summary: fallback,
    };
  }
}

export async function extractVideoContent(opts: {
  buffer: Buffer;
  title: string;
  originalFilename?: string | null;
}): Promise<{
  content: string;
  summary: string | null;
}> {
  try {
    const wavBuffer = await convertToWav(opts.buffer);
    const content = (await speechToText(wavBuffer, "wav")).trim();
    if (!content) {
      return { content: "", summary: null };
    }

    return {
      content,
      summary: await summarize(content),
    };
  } catch {
    const fallbackParts = [
      `Video source titled "${opts.title}".`,
      opts.originalFilename ? `Original filename: ${opts.originalFilename}.` : null,
      "Transcript extraction is unavailable on the current backend, so only source metadata was indexed.",
    ].filter(Boolean);

    const fallback = fallbackParts.join(" ");
    return {
      content: fallback,
      summary: fallback,
    };
  }
}

export async function readUploadedFile(relativePath: string): Promise<Buffer> {
  return readFile(path.join(uploadsDir, relativePath));
}
