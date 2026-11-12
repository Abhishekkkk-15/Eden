import type { Metric, MetricContext, MetricResult } from "../../types/metric";
import type { AIClient } from "../../types/client";

export interface ContextRecallOptions {
  aiClient?: AIClient;
  model?: string;
  topK?: number;
  name?: string;
}

const SYSTEM_PROMPT = `You are an expert AI evaluator assessing Retrieval Augmented Generation (RAG) quality.
Your task is to judge Context Recall: determine whether the retrieved context contains all necessary facts and claims present in the ground truth reference answer or expected facts.

Rubric:
- Score 1.0: 100% of the ground truth facts/claims can be directly verified and answered using the retrieved context.
- Score 0.7-0.9: Majority of key claims are present in context; only minor peripheral details are missing.
- Score 0.4-0.6: Partial recall; roughly half of the necessary facts are present.
- Score 0.1-0.3: Very low recall; only one or two isolated facts are mentioned.
- Score 0.0: None of the key facts from the ground truth answer appear in the context.

Respond strictly in valid JSON format:
{
  "score": <number between 0.0 and 1.0>,
  "explanation": "<concise 1-2 sentence explanation of which facts were found or missed>"
}`;

/**
 * Context Recall: Uses an LLM judge to determine what fraction of the reference answer's
 * key facts or ground truth passages can be attributed to the retrieved context.
 */
export function contextRecall(options?: ContextRecallOptions): Metric {
  const metricName = options?.name ?? "context_recall";
  const model = options?.model ?? "gpt-4o-mini";
  const topK = options?.topK ?? 5;

  return {
    name: metricName,
    description: `LLM-as-a-judge Context Recall against ground truth answer using ${model}`,
    async evaluate(context: MetricContext): Promise<MetricResult> {
      const client = options?.aiClient ?? context.aiClient;
      if (!client?.chat?.completions) {
        throw new Error(
          `Metric "${metricName}" requires an AIClient with chat completions support. Pass aiClient in options or runner.`
        );
      }

      const { queryCase, retrieved } = context;
      const referenceTarget =
        queryCase.groundTruth.referenceAnswer ||
        queryCase.groundTruth.expectedPassages?.join("\n\n");

      if (!referenceTarget || referenceTarget.trim().length === 0) {
        return {
          score: 1.0,
          explanation: "No reference answer or expected passages specified in ground truth; skipping recall penalty",
        };
      }

      const contextChunks = retrieved
        .slice(0, topK)
        .map((r, i) => `[Context Chunk ${i + 1}]\n${r.content}`)
        .join("\n\n---\n\n");

      if (!contextChunks.trim()) {
        return {
          score: 0.0,
          explanation: "Retrieved context is empty; cannot cover ground truth facts",
        };
      }

      const userPrompt = `Query: "${queryCase.query}"

Ground Truth Reference:
${referenceTarget}

Retrieved Context:
${contextChunks}

Evaluate the Context Recall score according to the rubric.`;

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
          metadata: { model, evaluatedChunks: Math.min(retrieved.length, topK) },
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
