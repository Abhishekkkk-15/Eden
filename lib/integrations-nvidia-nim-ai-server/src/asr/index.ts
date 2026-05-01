/**
 * NVIDIA NIM ASR / Whisper integration
 * Uses the OpenAI-compatible endpoint at integrate.api.nvidia.com
 * (same base URL and key used by the rest of the server)
 */
import OpenAI, { toFile } from "openai";

export type NIMModel =
  | "whisper-large-v3"       // OpenAI Whisper - best multilingual
  | "canary-1b-asr"          // NVIDIA's flagship - best quality
  | "parakeet-ctc-1.1b-asr"  // Fast, English only
  | "parakeet-ctc-0.6b-asr"; // Lightweight, English only

/** Lazy-initialised client so we don't throw at module-load time. */
function getNIMClient(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey) throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY is not set");
  if (!baseURL) throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL is not set");
  return new OpenAI({ apiKey, baseURL });
}

/**
 * Transcribe audio using NVIDIA NIM's OpenAI-compatible whisper endpoint.
 * Sends a multipart/form-data request via the OpenAI SDK (handles auth automatically).
 */
export async function speechToText(
  audioBuffer: Buffer,
  filename: string = "audio.mp3",
  model: NIMModel = "whisper-large-v3"
): Promise<string> {
  const client = getNIMClient();
  const ext = filename.split(".").pop() ?? "mp3";
  const file = await toFile(audioBuffer, filename, { type: getMimeType(ext) });
  const response = await client.audio.transcriptions.create({
    file,
    model,
  });
  return response.text ?? "";
}

/**
 * Detect audio format from buffer magic bytes.
 */
export function detectAudioFormat(buffer: Buffer): "mp3" | "wav" | "ogg" | "webm" | "mp4" | "unknown" {
  if (buffer.length < 12) return "unknown";

  // WAV: RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "wav";
  }
  // WebM: EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  // MP3: ID3 tag or frame sync
  if (
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  // MP4/M4A/MOV: ....ftyp
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "mp4";
  }
  // OGG: OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "ogg";
  }
  return "unknown";
}

/**
 * Get MIME type for a given audio format string.
 */
export function getMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    webm: "audio/webm",
    mp4: "audio/mp4",
  };
  return mimeTypes[format] ?? "audio/mpeg";
}

/**
 * Transcribe with automatic format detection.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  originalFilename?: string,
  model: NIMModel = "whisper-large-v3"
): Promise<{ text: string; format: string; model: NIMModel }> {
  const format = detectAudioFormat(audioBuffer);
  const ext = format === "unknown" ? "mp3" : format;
  const filename = originalFilename || `audio.${ext}`;

  const text = await speechToText(audioBuffer, filename, model);

  return { text, format: ext, model };
}
