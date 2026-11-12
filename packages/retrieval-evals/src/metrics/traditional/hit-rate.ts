import type { Metric, MetricContext, MetricResult } from "../../types/metric";
import { isItemRelevant } from "./helpers";

export interface HitRateOptions {
  k?: number;
  name?: string;
}

/**
 * Hit Rate @ K: Returns 1.0 if at least one relevant document is found within top K, else 0.0.
 */
export function hitRate(k = 5, options?: Omit<HitRateOptions, "k">): Metric {
  const metricName = options?.name ?? `hit_rate@${k}`;

  return {
    name: metricName,
    description: `Binary indicator of whether any relevant item was retrieved in top ${k}`,
    evaluate(context: MetricContext): MetricResult {
      const { queryCase, retrieved } = context;
      const topK = retrieved.slice(0, k);

      for (let i = 0; i < topK.length; i++) {
        if (isItemRelevant(topK[i], queryCase.groundTruth)) {
          return {
            score: 1.0,
            explanation: `Hit found at rank ${i + 1} within top ${k}`,
            metadata: { hitRank: i + 1, k },
          };
        }
      }

      return {
        score: 0.0,
        explanation: `No relevant items retrieved in top ${k}`,
        metadata: { hitRank: null, k },
      };
    },
  };
}
