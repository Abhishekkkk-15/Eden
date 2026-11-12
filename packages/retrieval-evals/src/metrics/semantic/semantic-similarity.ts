import type { Metric, MetricContext, MetricResult } from "../../types/metric";
import type { AIClient } from "../../types/client";
import { cosineSimilarity } from "./cosine";

export interface SemanticSimilarityOptions {
  aiClient?: AIClient;
  model?: string;
  topK?: number;
  aggregation?: "max" | "mean";
  name?: string;
}

/**
 * Computes cosine semantic similarity between the query and retrieved context chunks
 * using vector embeddings via an OpenAI-compatible AIClient.
 */
export function semanticSimilarity(options?: SemanticSimilarityOptions): Metric {
  const metricName = options?.name ?? "semantic_similarity";
  const model = options?.model ?? "text-embedding-3-small";
  const topK = options?.topK ?? 3;
  const aggregation = options?.aggregation ?? "max";

  return {
    name: metricName,
    description: `Cosine semantic similarity between query and retrieved chunks using ${model} (${aggregation})`,
    async evaluate(context: MetricContext): Promise<MetricResult> {
      const client = options?.aiClient ?? context.aiClient;
      if (!client) {
        throw new Error(
          `Metric "${metricName}" requires an AIClient with embeddings support. Pass aiClient in options or runner.`
        );
      }

      const { queryCase, retrieved } = context;
      const chunks = retrieved
        .slice(0, topK)
        .map((r) => r.content.trim())
        .filter((c) => c.length > 0);

      if (chunks.length === 0) {
        return {
          score: 0,
          explanation: "No retrieved content available to compute semantic similarity",
        };
      }

      // Generate embedding for query and candidate chunks
      const textsToEmbed = [queryCase.query, ...chunks];
      const embeddingRes = await client.embeddings.create({
        model,
        input: textsToEmbed,
      });

      const vectors = embeddingRes.data.map((d) => d.embedding);
      const queryVector = vectors[0];
      const chunkVectors = vectors.slice(1);

      if (!queryVector || chunkVectors.length === 0) {
        return {
          score: 0,
          explanation: "Failed to obtain embeddings for query and retrieved chunks",
        };
      }

      const similarities = chunkVectors.map((v) => cosineSimilarity(queryVector, v));

      let finalScore = 0;
      if (aggregation === "max") {
        finalScore = Math.max(...similarities);
      } else {
        const sum = similarities.reduce((a, b) => a + b, 0);
        finalScore = sum / similarities.length;
      }

      return {
        score: Math.round(finalScore * 1000) / 1000,
        explanation: `${aggregation.toUpperCase()} cosine similarity: ${finalScore.toFixed(3)} across top ${chunks.length} chunks`,
        metadata: {
          aggregation,
          similarities,
          evaluatedChunks: chunks.length,
          model,
        },
      };
    },
  };
}
