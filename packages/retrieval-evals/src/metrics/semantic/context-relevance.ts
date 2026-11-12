import type { Metric, MetricContext, MetricResult } from "../../types/metric";
import type { AIClient } from "../../types/client";

export interface ContextRelevanceOptions {
  aiClient?: AIClient;
  model?: string;
  topK?: number;
  name?: string;
}

const SYSTEM_PROMPT = `You are an expert AI evaluator assessing Retrieval Augmented Generation (RAG) retrieval quality.
Your task is to judge the Context Relevance of retrieved passages for a given user query.

Rubric:
- Score 1.0: All retrieved passages directly address the query with high signal and minimal/no irrelevant noise.
- Score 0.7-0.9: Most passages are relevant, with minor irrelevant background details.
- Score 0.4-0.6: Passages are only partially relevant; contains significant noise or tangential info.
- Score 0.1-0.3: Barely relevant; only touches upon isolated keywords without answering the core intent.
- Score 0.0: Completely irrelevant passages; does not address the query at all.

Respond strictly in valid JSON format:
{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<concise 1-2 sentence reasoning>"
}`;

/**
 * Context Relevance: Uses an LLM judge to evaluate how relevant and noise-free
 * the retrieved passages are with respect to the user query.
 */
export function contextRelevance(options?: ContextRelevanceOptions): Metric {
  const metricName = options?.name ?? "context_relevance";
  const model = options?.model ?? "gpt-4o-mini";
  const topK = options?.topK ?? 5;

  return {
    name: metricName,
    description: `LLM-as-a-judge Context Relevance (signal-to-noise ratio) using ${model}`,
    async evaluate(context: MetricContext): Promise<MetricResult> {
      const client = options?.aiClient ?? context.aiClient;
      if (!client?.chat?.completions) {
        throw new Error(
          `Metric "${metricName}" requires an AIClient with chat completions support. Pass aiClient in options or runner.`
        );
      }

      const { queryCase, retrieved } = context;
      const chunks = retrieved
        .slice(0, topK)
        .map((r, i) => `[Passage ${i + 1} (Score: ${r.score ?? "N/A"})]\n${r.content}`)
        .join("\n\n---\n\n");

      if (!chunks.trim()) {
        return {
          score: 0,
          explanation: "No retrieved content to evaluate relevance",
        };
      }

      const userPrompt = `Query: "${queryCase.query}"

Retrieved Passages:
${chunks}

Evaluate the Context Relevance score according to the rubric.`;

      const response = await client.chat.completions.create({
        model,
        temperature: 0.0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      });

      const rawContent = response.choices?.[0]?.message?.content?.trim() ?? "{}";
      try {
        const parsed = JSON.parse(rawContent);
        const score = typeof parsed.score === "number" ? Math.max(0, Math.min(1, parsed.score)) : 0;
        return {
          score,
          explanation: parsed.explanation ?? "Evaluated by LLM judge",
          metadata: { model, evaluatedPassages: Math.min(retrieved.length, topK) },
        };
      } catch (err) {
        return {
          score: 0,
          explanation: `Failed to parse LLM judge response: ${String(err)}`,
          metadata: { rawContent },
        };
      }
    },
  };
}
