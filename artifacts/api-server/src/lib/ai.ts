import OpenAI from "openai";
import { openai as nvidiaClient } from "@workspace/integrations-openai-ai-server";

let groqClientInstance: OpenAI | null = null;

function getGroqClient() {
  if (groqClientInstance) return groqClientInstance;
  const apiKey = process.env.AI_INTEGRATIONS_GROQ_API_KEY;
  if (!apiKey || apiKey === "gsk_your_key_here") {
    throw new Error("AI_INTEGRATIONS_GROQ_API_KEY is not set.");
  }
  groqClientInstance = new OpenAI({
    apiKey,
    baseURL: "https://api.groq.com/openai/v1",
  });
  return groqClientInstance;
}

// Groq models for text
export const CHAT_MODEL = "llama-3.3-70b-versatile";
// NVIDIA NIM model for vision (since Groq account lacks vision access)
export const VISION_MODEL = "meta/llama-3.2-11b-vision-instruct";

export async function completeText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const client = getGroqClient();
  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    max_completion_tokens: opts.maxTokens ?? 8192,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  return res.choices?.[0]?.message?.content?.trim() ?? "";
}

export async function* streamChat(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): AsyncGenerator<string> {
  const client = getGroqClient();
  const stream = await client.chat.completions.create({
    model: CHAT_MODEL,
    max_completion_tokens: 8192,
    stream: true,
    messages,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function summarize(text: string): Promise<string> {
  const trimmed = text.slice(0, 12000);
  if (trimmed.length < 200) return trimmed;
  return completeText({
    system:
      "You write concise, faithful summaries. Reply with 2-4 plain sentences. No preamble, no headings.",
    user: `Summarize the following content:\n\n${trimmed}`,
    maxTokens: 400,
  });
}

export async function describeImageDataUrl(dataUrl: string): Promise<string> {
  // Use NVIDIA NIM for Vision
  const res = await nvidiaClient.chat.completions.create({
    model: VISION_MODEL,
    max_completion_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Provide a complete, exhaustive, and verbatim transcription of all visible text in this image. Do not provide a brief description or summarize the text. In addition to the full transcription, include a detailed description of all entities, scenes, objects, and any facts a user may later search for. Reply in plain text only.",
          },
          {
            type: "image_url",
            image_url: {
              url: dataUrl,
            },
          },
        ] as any,
      },
    ],
  });

  return res.choices?.[0]?.message?.content?.trim() ?? "";
}
