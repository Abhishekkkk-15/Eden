import type { Metric, MetricContext, MetricResult } from "../../types/metric";
import { isItemRelevant } from "./helpers";

export interface MrrOptions {
  name?: string;
  maxK?: number;
}

/**
 * Reciprocal Rank (RR): 1 / rank of the first relevant retrieved document.
 * Aggregated across queries as Mean Reciprocal Rank (MRR).
 */
export function mrr(options?: MrrOptions): Metric {
  const metricName = options?.name ?? "mrr";
  const maxK = options?.maxK;

  return {
    name: metricName,
    description: "Reciprocal Rank (1/rank) of the first relevant retrieved document",
    evaluate(context: MetricContext): MetricResult {
      const { queryCase, retrieved } = context;
      const candidates = maxK ? retrieved.slice(0, maxK) : retrieved;

      for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        if (isItemRelevant(item, queryCase.groundTruth)) {
          const rank = i + 1;
          const score = 1 / rank;
          return {
            score,
            explanation: `First relevant item found at rank ${rank}`,
            metadata: { firstRelevantRank: rank, itemId: item.id },
          };
        }
      }

      return {
        score: 0,
        explanation: "No relevant items found in retrieved results",
        metadata: { firstRelevantRank: null },
      };
    },
  };
}
