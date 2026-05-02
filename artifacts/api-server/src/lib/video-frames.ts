import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describeImageDataUrl } from "./ai";

const execAsync = promisify(exec);

export interface VideoFrame {
  timestamp: number; // seconds
  dataUrl: string;
  description?: string;
}

export interface FrameExtractionOptions {
  intervalSeconds?: number; // Extract frame every N seconds (default: 5)
  maxFrames?: number; // Maximum frames to extract (default: 20)
  width?: number; // Frame width (default: 512)
}

/**
 * Extract frames from a video file using ffmpeg
 */
export async function extractVideoFrames(
  videoBuffer: Buffer,
  options: FrameExtractionOptions = {}
): Promise<VideoFrame[]> {
  const {
    intervalSeconds = 5,
    maxFrames = 20,
    width = 512,
  } = options;

  // Create temp directory
  const tempId = randomBytes(8).toString("hex");
  const tempDir = join(tmpdir(), `video-frames-${tempId}`);
  const videoPath = join(tempDir, "video.mp4");

  try {
    await mkdir(tempDir, { recursive: true });

    // Write video to temp file
    await Bun.write(videoPath, videoBuffer);

    // Get video duration using ffprobe
    const { stdout: durationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    const duration = parseFloat(durationStr.trim());

    if (isNaN(duration) || duration <= 0) {
      throw new Error("Could not determine video duration");
    }

    // Calculate frame extraction points
    const frameCount = Math.min(Math.floor(duration / intervalSeconds), maxFrames);
    const frames: VideoFrame[] = [];

    // Extract frames at intervals
    for (let i = 0; i < frameCount; i++) {
      const timestamp = i * intervalSeconds;
      const outputPath = join(tempDir, `frame-${i.toString().padStart(4, "0")}.jpg`);

      try {
        // Extract single frame using ffmpeg
        await execAsync(
          `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -vf "scale=${width}:-1" -q:v 2 -f image2 "${outputPath}" -y`
        );

        // Read and convert to data URL
        const frameBuffer = await readFile(outputPath);
        const dataUrl = `data:image/jpeg;base64,${frameBuffer.toString("base64")}`;

        frames.push({
          timestamp,
          dataUrl,
        });

        // Clean up frame file
        await unlink(outputPath);
      } catch (err) {
        console.warn(`Failed to extract frame at ${timestamp}s:`, err);
        // Continue with other frames
      }
    }

    return frames;
  } catch (error) {
    console.error("Failed to extract video frames:", error);
    return [];
  } finally {
    // Cleanup temp directory
    try {
      const files = await readdir(tempDir);
      await Promise.all(files.map(f => unlink(join(tempDir, f))));
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Analyze video frames using vision model
 */
export async function analyzeVideoFrames(
  frames: VideoFrame[],
  videoTitle: string
): Promise<VideoFrame[]> {
  const analyzedFrames: VideoFrame[] = [];

  for (const frame of frames) {
    try {
      // Describe the frame using vision model
      const description = await describeImageDataUrl(frame.dataUrl);

      if (description) {
        analyzedFrames.push({
          ...frame,
          description: `[${formatTimestamp(frame.timestamp)}] ${description}`,
        });
      }
    } catch (err) {
      console.warn(`Failed to analyze frame at ${frame.timestamp}s:`, err);
    }
  }

  return analyzedFrames;
}

/**
 * Format seconds to HH:MM:SS or MM:SS
 */
function formatTimestamp(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Extract and analyze video frames in one step
 */
export async function extractAndAnalyzeVideoFrames(
  videoBuffer: Buffer,
  videoTitle: string,
  options?: FrameExtractionOptions
): Promise<{ frames: VideoFrame[]; combinedDescription: string }> {
  // Extract frames
  const frames = await extractVideoFrames(videoBuffer, options);

  if (frames.length === 0) {
    return { frames: [], combinedDescription: "" };
  }

  // Analyze frames with vision model
  const analyzedFrames = await analyzeVideoFrames(frames, videoTitle);

  // Combine all frame descriptions
  const combinedDescription = analyzedFrames
    .map(f => f.description)
    .filter(Boolean)
    .join("\n\n");

  return {
    frames: analyzedFrames,
    combinedDescription,
  };
}
