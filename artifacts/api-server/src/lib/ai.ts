import { openai } from "@workspace/integrations-openai-ai-server";

export const CHAT_MODEL = "gpt-5.4";

export async function completeText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const res = await openai.chat.completions.create({
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
  const stream = await openai.chat.completions.create({
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
  const res = await openai.chat.completions.create({
    model: CHAT_MODEL,
    max_completion_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Describe this image for workspace search. Include visible text, entities, scenes, objects, and any facts a user may later search for. Reply in plain text only.",
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
