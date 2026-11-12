import type { Metric } from "../types/metric";
import type { AIClient } from "../types/client";
import { mrr } from "./traditional/mrr";
import { hitRate } from "./traditional/hit-rate";
import { precisionAtK } from "./traditional/precision-at-k";
import { recallAtK } from "./traditional/recall-at-k";
import { semanticSimilarity } from "./semantic/semantic-similarity";
import { contextRelevance } from "./semantic/context-relevance";
import { contextRecall } from "./semantic/context-recall";

export interface PresetOptions {
  k?: number;
  aiClient?: AIClient;
  embeddingClient?: AIClient;
  chatClient?: AIClient;
  embeddingModel?: string;
  chatModel?: string;
}

export type MetricPresetName = "standard" | "semantic" | "all";

export const presets = {
  /**
   * Standard Information Retrieval (IR) metrics:
   * MRR, HitRate@1, HitRate@K, Precision@K, Recall@K.
   */
  standard(options?: { k?: number }): Metric[] {
    const k = options?.k ?? 5;
    return [mrr(), hitRate(1), hitRate(k), precisionAtK(k), recallAtK(k)];
  },

  /**
   * Semantic & LLM-as-a-judge metrics:
   * Embedding Cosine Similarity, Context Relevance (signal-to-noise), Context Recall (ground-truth fact coverage).
   * Supports dedicated embedding and chat clients/models if they differ.
   */
  semantic(options?: {
    aiClient?: AIClient;
    embeddingClient?: AIClient;
    chatClient?: AIClient;
    embeddingModel?: string;
    chatModel?: string;
  }): Metric[] {
    const embClient = options?.embeddingClient ?? options?.aiClient;
    const chClient = options?.chatClient ?? options?.aiClient;
    return [
      semanticSimilarity({ aiClient: embClient, model: options?.embeddingModel }),
      contextRelevance({ aiClient: chClient, model: options?.chatModel }),
      contextRecall({ aiClient: chClient, model: options?.chatModel }),
    ];
  },

  /**
   * Complete metric suite combining both Traditional IR and Semantic metrics.
   */
  all(options?: PresetOptions): Metric[] {
    return [
      ...presets.standard({ k: options?.k }),
      ...presets.semantic(options),
    ];
  },
};

/**
 * Resolves a preset name or metric array into an array of Metric instances.
 */
export function resolveMetrics(
  metricsInput?: MetricPresetName | Metric[],
  options?: PresetOptions
): Metric[] {
  if (Array.isArray(metricsInput)) {
    return metricsInput;
  }

  const presetName: MetricPresetName = metricsInput ?? "standard";
  switch (presetName) {
    case "semantic":
      return presets.semantic(options);
    case "all":
      return presets.all(options);
    case "standard":
    default:
      return presets.standard({ k: options?.k });
  }
}
